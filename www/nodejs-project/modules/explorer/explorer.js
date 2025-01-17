
const Events = require('events'), Limiter = require('../limiter')

class Explorer extends Events {
	constructor(opts){
        super()
        this.pages = {'': []}
        this.opts = {
            debug: false
        }
        if(opts){
            this.opts = Object.assign(this.opts, opts)
        }
        this.rendering = true
        this.waitingRender = false
        this.path = ''
        this.filters = []
        this.currentEntries = []
        this.backIcon = 'fas fa-chevron-left'
        this.addFilter(async (es, path) => {
            return es.map(e => {
                let o = e
                if(o){
                    if(!e.path || e.path.indexOf(path) == -1){
                        o.path = e.name
                        if(path){
                            o.path = path +'/'+ o.path
                        }
                    }
                    if(typeof(e.checked) == 'function'){
                        o.value = !!e.checked(e)
                    } else if(typeof(e.value) == 'function'){
                        o.value = e.value()
                    }
                }
                return o
            })
        })
        
        this.softRefreshLimiter = {
            limiter: new Limiter(() => {
                this.softRefresh()
                this.deepRefreshLimiter.limiter.fromNow()
            }, 5000),
            path: ''
        }
        this.deepRefreshLimiter = {
            limiter: new Limiter(p => {
                this.deepRefresh(p)
                this.softRefreshLimiter.limiter.fromNow()
            }, 5000),
            path: ''
        }

        global.uiReady(() => {
            global.streamer.on('streamer-connect', () => {
                this.softRefreshLimiter.limiter.pause()
                this.deepRefreshLimiter.limiter.pause()
            })
            global.streamer.on('streamer-disconnect', () => {
                this.softRefreshLimiter.limiter.resume()
                this.deepRefreshLimiter.limiter.resume()
            })
        })
        global.ui.on('explorer-menu-playing', showing => {
            if(global.streamer.active){
                if(showing) {
                    this.softRefreshLimiter.limiter.resume()
                    this.deepRefreshLimiter.limiter.resume()
                } else {
                    this.softRefreshLimiter.limiter.pause()
                    this.deepRefreshLimiter.limiter.pause()
                }
            }
        })
        global.ui.on('explorer-open', (path, tabindex) => {
            if(this.opts.debug){
                console.log('explorer-open', path, tabindex)
            }
            this.open(path, tabindex).catch(global.displayErr)
        })
        global.ui.on('explorer-action', (path, tabindex) => this.action(path, tabindex))
        global.ui.on('explorer-back', () => this.back())
        global.ui.on('explorer-check', (path, val) => this.check(path, val))
        global.ui.on('explorer-input', (path, val) => {
            if(this.opts.debug){
                console.log('explorer-input', path, val)
            }
            this.input(path, val)
        })
        global.ui.on('explorer-select', (path, tabindex) => {
            this.select(path, tabindex).catch(global.displayErr)
        })
        this.applyFilters(this.pages[this.path], this.path).then(es => {
            this.pages[this.path] = es
            if(this.waitingRender){
                this.waitingRender = false
                this.render(this.pages[this.path], this.path, 'fas fa-home')
            }
        }).catch(global.displayErr)
    }
    async updateHomeFilters(){
        this.applyFilters(this.pages[''], '').then(es => {
            this.pages[''] = es
            if(this.path == ''){
                this.refresh()
            }
        }).catch(console.error)
    }
    dialog(opts, def, mandatory){
        return new Promise((resolve, reject) => {
            let uid = 'ac-'+ Date.now()
            global.ui.once(uid, ret => resolve(ret))
            global.ui.emit('dialog', opts, uid, def, mandatory)
        })
    }
    prompt(atts){
        return new Promise((resolve, reject) => {
            if(!atts.placeholder) atts.placeholder = atts.question
            if(!atts.callback) atts.callback = 'ac-'+ Date.now()
            global.ui.once(atts.callback, ret => resolve(ret))
            global.ui.emit('prompt', atts)
        })
    }
    info(question, message, fa){
        global.ui.emit('info', question, message, fa)
    }
    checkFlags(entries){
        return entries.map(n => {
            let e = Object.assign({}, n)
            let details = []
            if(e.details){
                details.push(e.details)
            }
            if(e.usersPercentage || e.users){
                let s = '', c = e.users > 1 ? 'users' : 'user'
                if(typeof(e.trend) == 'number') {
                    if(e.trend == -1) {
                        c = 'caret-down'
                        s = ' style="color: #f30;font-weight: bold;"'
                    } else {
                        c = 'caret-up'
                        s = ' style="color: green;font-weight: bold;"'
                    }
                }
                if(e.usersPercentage){
                    let p = e.usersPercentage >= 1 ? Math.round(e.usersPercentage) : e.usersPercentage.toFixed(e.usersPercentage >= 0.1 ? 1 : 2)
                    details.push('<i class="fas fa-' + c + '" '+ s +'></i> ' + p +'%')
                } else if(e.users){
                    details.push('<i class="fas fa-' + c + '" '+ s +'></i> ' + e.users)
                }
            }
            if(e.position && this.path == global.lang.TRENDING){
                details.push('<i class="fas fa-trophy" style="transform: scale(0.8)"></i> '+ e.position)
            }
            e.details = details.join(' <span style="opacity: 0.25">&middot</span> ')
            return e
        })
    }
    emptyEntry(txt, icon){
        return {
            name: txt || global.lang.EMPTY, 
            icon: icon || 'fas fa-info-circle', 
            type: 'action',
            class: 'entry-empty'
        }
    }
    start(){
        if(typeof(this.pages[this.path]) != 'undefined'){
            this.render(this.pages[this.path], this.path, 'fas fa-home')
        } else {
            this.waitingRender = true
        }
    }
    refresh(deep=false, p){
        if(this.rendering){
            const type = deep === true ? 'deepRefreshLimiter' : 'softRefreshLimiter'
            this.refreshingPath = this.path
            if(this[type].path == this.path) {
                this[type].limiter.call()
            } else {
                this[type].path = this.path
                this[type].limiter.skip(p)
            }
        }
    }
    refreshNow(){
        this.softRefresh(this.path, true)
    }
    softRefresh(p, force){
        if(force !== true && this.refreshingPath != this.path) return
        if(!this.startExecTime) this.startExecTime = global.time()
        if(this.rendering){
            if(this.path && typeof(this.pages[this.path]) != 'undefined'){
                delete this.pages[this.path]
            }
            this.open(this.path).catch(global.displayErr)
        }
    }
    deepRefresh(p, force){
        if(force !== true && this.refreshingPath != this.path) return
        if(!this.startExecTime) this.startExecTime = global.time()
        if(this.rendering){
            if(!p){
                p = this.path
            }
            this.deepRead(p).then(ret => {
                this.render(ret.entries, p, (ret.parent ? ret.parent.fa : '') || 'fas fa-box-open')
            }).catch(global.displayErr)
        }
    }
    inSelect(){
        if(typeof(this.pages[this.dirname(this.path)]) != 'undefined'){
            let p = this.selectEntry(this.pages[this.dirname(this.path)], this.basename(this.path))
            return p && p.type == 'select'
        }
    }
    back(level, deep){
        let p = this.path
        if(this.opts.debug){
            console.log('back', this.path)
        }
        if(this.path) {
            if(this.inSelect()){
                this.path = this.dirname(this.path)
            }
            let e = this.selectEntry(this.pages[this.path], global.lang.BACK)
            if(this.opts.debug){
                console.log('back', this.path, p, e)
            }
            if(e && e.action){
                let ret = e.action()
                if(ret && ret.catch) ret.catch(global.displayErr)
                return
            }
            if(typeof(level) != 'number'){
                level = 1
            }
            while(p && level > 0){
                p = this.dirname(p)
                level--
            }
            if(this.opts.debug){
                console.log('back', p, deep)
            }
            this.open(p, undefined, deep, true, true, true).catch(global.displayErr)
        } else {
            this.refresh()
        }
    }
    prependFilter(f){
        this.filters.unshift(f)
    }
    addFilter(f){
        this.filters.push(f)
    }
    async applyFilters(entries, path) {
        let i = 0
        const next = async () => {
            if (typeof this.filters[i] === 'undefined') {
                entries = entries.map((e) => {
                    if (!e.path) {
                        e.path = (path ? path + '/' : '') + e.name
                    } else if (e.path && this.basename(e.path) !== e.name) {
                        e.path += '/' + e.name
                    }
                    return e
                })
                return entries
            } else {
                try {
                    const es = await this.filters[i](entries, path)
                    i++;
                    if (Array.isArray(es)) {
                        entries = es
                    } else {
                        console.error('Explorer filter failure', this.filters[i], es)
                    }
                    return next()
                } catch (e) {
                    i++
                    console.error(e)
                    return next()
                }
            }
        }
        if (Array.isArray(entries)) {
            return await next()
        } else {
            return entries || []
        }
    }
    syncPages(){
        Object.keys(this.pages).forEach(page => {
            if(this.path && this.path.indexOf(page) == -1){
                delete this.pages[page]
            }
        })
    }
    check(destPath, value){
        let name = this.basename(destPath), dir = this.dirname(destPath)
        if(typeof(this.pages[dir]) == 'undefined'){
            console.error(dir + 'NOT FOUND IN', this.pages)
        } else {
            if(!this.pages[dir].some((e, k) => {
                if(e.name == name){
                    //console.warn('CHECK', dir, k, this.pages[dir])
                    if(typeof(this.pages[dir][k].value) != 'function'){
                        this.pages[dir][k].value = value
                    }
                    if(typeof(e.action) == 'function'){
                        let ret = e.action(e, value)
                        if(ret && ret.catch) ret.catch(console.error)
                    }
                    return true
                }
            })){
                console.warn('CHECK '+ destPath +' ('+ value +') NOT FOUND IN ', this.pages)
            }
        }
    }
    input(destPath, value){
        let name = this.basename(destPath), dir = this.dirname(destPath)        
        if(this.opts.debug){
            console.log('input()', destPath, value, name, dir)
        }
        if(typeof(this.pages[dir]) == 'undefined'){
            console.error(dir + 'NOT FOUND IN', this.pages)
        } else {
            let trustedActionTriggered = this.pages[dir].some((e, k) => {
                if(e.name == name && ['input', 'slider'].includes(e.type)){
                    this.pages[dir][k].value = value
                    if(typeof(e.action) == 'function'){
                        let ret = e.action(e, value)
                        if(ret && ret.catch) ret.catch(console.error)
                    }
                    console.error('input ok', e, this.path, destPath)
                    return true
                }
            })
            if(!trustedActionTriggered){
                if(dir != this.path){
                    dir = this.path
                    this.pages[dir].some((e, k) => {
                        if(e.name == name && ['input', 'slider'].includes(e.type)){
                            this.pages[dir][k].value = value
                            if(typeof(e.action) == 'function'){
                                let ret = e.action(e, value)
                                if(ret && ret.catch) ret.catch(console.error)
                            }
                            console.error('input ok', e, this.pages[dir][k])
                            return true
                        }
                    })
                }
                console.error('input ok?', dir)
            }
        }
    }
    action(destPath, tabindex){
        let name = this.basename(destPath), dir = this.dirname(destPath)
        if(this.opts.debug){
            console.log('action '+ destPath, tabindex)
        }
        if(typeof(this.pages[dir]) == 'undefined'){
            console.error(dir + 'NOT FOUND IN', this.pages)
        } else {
            let inSelect = this.pages[dir].some(e => typeof(e.selected) != 'undefined')
            if(!this.pages[dir].some((e, k) => {
                if(e.name == name && (typeof(tabindex) != 'number' || k == tabindex)){
                    if(inSelect){
                        this.pages[dir][k].selected = true
                    }
                    this.emit('action', e)
                    if(this.inSelect()){
                        this.path = this.dirname(this.path)
                    }
                    return true
                } else {
                    if(inSelect){
                        this.pages[dir][k].selected = false
                    }
                }
            })){
                console.warn('ACTION '+ name +' ('+ tabindex +') NOT FOUND IN ', dir, this.pages)
            }
        }
    }
	setLoadingEntries(es, state, txt){
		es.map(e => {
			if(typeof(e) == 'string'){
				return {name: e}
			} else {
				let _e = {};
				['path', 'url', 'name', 'tabindex'].forEach(att => {
					if(e[att]){
						_e[att] = e[att]
					}
				})
				return _e
			}
		}).forEach(e => global.ui.emit('set-loading', e, state, txt))
	}
    basename(path){
        let i = path.lastIndexOf('/')
        if(i == 0){
            return path.substr(1)
        } else if(i == -1) {
            return path
        } else {
            return path.substr(i + 1)
        }
    }
    dirname(path){
        let i = path.lastIndexOf('/')
        if(i <= 0){
            return ''
        } else {
            return path.substr(0, i)
        }
    }
    deepRead(destPath, tabindex){
        return new Promise((resolve, reject) => {
            if(['.', '/'].includes(destPath)){
                destPath = ''
            }
            let parent, parts = destPath ? destPath.split('/') : [], pages = {'' : this.pages['']}
            let finish = entries => {
                resolve({entries, parent})
            }
            let p = ''
            let next = () => {
                if(parts.length){
                    let n = parts.shift()
                    let np = p ? p + '/' + n : n
                    let e = this.selectEntry(pages[p], n)
                    p = np
                    if(['group', 'select'].indexOf(e.type) != -1){
                        parent = e
                        this.readEntry(e, p).then(es => {
                            this.applyFilters(es, p).then(es => {
                                if(e.type == 'group'){
                                    es = this.addMetaEntries(es, p)
                                }
                                this.pages[p] = pages[p] = es
                                if(this.opts.debug){
                                    console.log('updated page', p, es)
                                }
                                next()
                            })
                        }).catch(reject)
                    } else {
                        if(typeof(this.pages[destPath]) != 'undefined'){ // fallback
                            console.error('deep path not found, falling back', destPath, this.pages[destPath])
                            return finish(this.pages[destPath])
                        }
                        reject('deep path not found: '+ destPath)
                    }
                } else {
                    finish(pages[destPath])
                } 
            }
            next()
        })
    }
    async read(destPath, tabindex, allowCache){
        const refPath = this.path
        if(['.', '/'].includes(destPath)){
            destPath = ''
        }
        let parentPath = this.dirname(destPath)
        if(typeof(this.pages[parentPath]) == 'undefined'){
            return await this.deepRead(destPath, tabindex)
        }
        let basePath = this.basename(destPath), finish = (entries, parent) => {
            if(![refPath, destPath].includes(this.path)){
                console.warn('Out of sync read() blocked', refPath, destPath, this.path)
                return -1 // user already navigated away, abort it
            }
            if(!parent || !['select'].includes(parent.type)){
                this.path = destPath
            }
            return {entries, parent}
        }
        if(!basePath){
            const es = await this.applyFilters(this.pages[parentPath], parentPath)
            this.pages[parentPath] = es
            return finish(this.pages[parentPath])
        }
        let i = 0, found, page = this.pages[parentPath]
        for(const e of page) {
            if(e.name == basePath && (typeof(tabindex) != 'number' || i == tabindex)) {
                if(['group', 'select'].indexOf(e.type) != -1) {
                    if(allowCache && typeof(this.pages[destPath]) != 'undefined') {
                        return finish(this.pages[destPath], e)
                    }
                    let es = await this.readEntry(e, parentPath)
                    if(!Array.isArray(es)){
                        return es
                    }
                    es = await this.applyFilters(es, destPath)
                    if(e.type == 'group'){
                        es = this.addMetaEntries(es, destPath, parentPath)
                    }
                    this.pages[destPath] = es
                    return finish(this.pages[destPath], e)
                }
                found = true
                break
            }
            i++
        }
        if(!found) {
            // maybe it's a "ghost" page like search results, which is not linked on navigation
            // but shown directly via render() instead
            if(typeof(this.pages[destPath]) != 'undefined'){ // fallback
                console.error('path not found, falling back', destPath, this.pages[destPath])
                return finish(this.pages[destPath])
            }
            console.error('path not found', {
                parentPath,
                destPath,
                tabindex,
                basePath,
                nmPage: page.map(e => e.name)
            })
            throw 'path not found '+ global.traceback()
        }
    }
    async open(destPath, tabindex, deep, isFolder, backInSelect){
        if(['.', '/'].includes(destPath)){
            destPath = ''
        }
        if(this.opts.debug){
            console.log('open', destPath, tabindex, traceback())
        }
        this.emit('open', destPath)
        let parentEntry, name = this.basename(destPath), parentPath = this.dirname(destPath)
        if(Array.isArray(this.pages[parentPath])) {
            const i = this.pages[parentPath].findIndex(e => e.name == name)
            if(i != -1) {
                const e = this.pages[parentPath][i]
                if(e.url && (!e.type || e.type == 'stream')) { // force search results to open directly
                    return this.action(destPath, tabindex)
                }
            }
        }
        let finish = async es => {
            if(backInSelect && parentEntry && parentEntry.type == 'select'){
                if(this.opts.debug){
                    console.log('backInSelect', backInSelect, parentEntry, destPath, global.traceback())
                }
                return await this.open(this.dirname(destPath), -1, deep, isFolder, backInSelect)
            }
            this.path = destPath
            es = this.addMetaEntries(es, destPath, parentPath)
            this.pages[this.path] = es
            await this.render(this.pages[this.path], this.path, parentEntry)
            return true
        }
        let ret = await this[deep === true ? 'deepRead' : 'read'](parentPath, undefined)
        if(this.opts.debug){
            console.log('readen', deep, parentPath, name, ret)
        }
        if(ret == -1) return
        parentEntry = ret.parent
        if(name){
            let e = this.selectEntry(ret.entries, name, tabindex, isFolder)
            if(this.opts.debug){
                console.log('selectEntry', destPath, ret.entries, name, tabindex, isFolder, e)
            }
            if(e){
                parentEntry = e
                if(e.type == 'group'){
                    let es = await this.readEntry(e, parentPath)
                    es = await this.applyFilters(es, destPath)
                    return await finish(es)
                } else if(e.type == 'select'){
                    if(backInSelect){
                        return await this.open(this.dirname(destPath), -1, deep, isFolder, backInSelect)
                    } else {
                        await this.select(destPath, tabindex)
                        return true
                    }
                } else {
                    this.action(destPath, tabindex)
                    return true
                }
            } else {
                if(this.opts.debug){
                    console.log('noParentEntry', destPath, this.pages[destPath], ret)
                }
                if(typeof(this.pages[destPath]) != 'undefined'){
                    return await finish(this.pages[destPath])
                } else {
                    return await this.open(this.dirname(destPath), undefined, deep, undefined, backInSelect)
                }
            }
        } else {
            this.path = destPath
            await this.render(this.pages[this.path], this.path, parentEntry)
            return true
        }
    }
    async readEntry(e){
        let entries
        if(!e) return []
        if(typeof(e.renderer) == 'function') {
            entries = await e.renderer(e)
        } else if(typeof(e.renderer) == 'string') {
            entries = await global.storage.get(e.renderer)
        } else {
            entries = e.entries || []
        }
        if(Array.isArray(entries)){
            return entries.map(n => {
                if(typeof(n.path) != 'string'){
                    n.path = (e.path ? e.path +'/' : '') + n.name
                } else {
                    if(n.path){
                        if(this.basename(n.path) != n.name || (n.name == e.name && this.basename(this.dirname(n.path)) != n.name)){
                            if(this.opts.debug){
                                console.log('npath', n.path, n.name, n, e)
                            }
                            n.path += '/'+ n.name
                        }
                    }
                }
                return n
            })
        }
        return []
    }
    selectEntry(entries, name, tabindex, isFolder){
        let ret = false
        if(Array.isArray(entries)){
            entries.some((e, i) => {
                if(e.name == name){
                    let fine
                    if(typeof(tabindex) == 'number' && tabindex != -1){
                        fine = tabindex == i
                    } else if(isFolder) {
                        fine = ['group', 'select'].includes(e.type)
                    } else {
                        fine = true
                    }
                    if(fine){
                        ret = e
                        return true
                    }
                }
            })
            if(!ret){
                let candidates = entries.filter((e, i) => {
                    if(e.name == name){
                        return true
                    }
                })
                if(candidates.length == 1){
                    ret = candidates[0]
                } else if(candidates.length) {
                    ret = candidates.sort((a, b) => {
                        return Math.abs(a.tabindex - tabindex) - Math.abs(b.tabindex - tabindex)
                    }).shift()
                }
                if(this.opts.debug){
                    if(ret){
                        console.log('selectEntry did not found it by tabindex '+ tabindex +' picking nearest one ('+ ret.tabindex +')', ret)
                    } else {
                        console.log('selectEntry did not found it by name')
                    }
                }
            }
        }
        return ret
    }
    async select(destPath, tabindex){
        if(this.opts.debug){
            console.log('select '+ destPath+', '+ tabindex)
        }
        let ret = await this.read(destPath, tabindex)
        if(ret && ret != -1){
            if(ret.entries && ret.entries.length > 1){
                let d = this.dirname(destPath)
                let icon = ret.parent ? ret.parent.fa : ''
                global.ui.emit('explorer-select', ret.entries, destPath, icon)
            } else {
                await this.open(destPath, tabindex, undefined, undefined, true) // set backInSelect to prevent looping
            }
        }
        return ret
    }
    canApplyStreamTesting(entries){
        return entries.length && entries.some(e => e.url && (!e.type || e.type == 'stream') && !global.mega.isMega(e.url))
    }
    addMetaEntries(entries, path, backTo){
        if(path){
            if(!entries.length || entries[0].type != 'back'){
                if(!entries.length){
                    entries.push(this.emptyEntry())
                }
                let backEntry = {
                    name: global.lang.BACK,
                    type: 'back',
                    fa: this.backIcon,
                    path: backTo || this.dirname(path)
                }
                entries.unshift(backEntry)
                if(!global.config.get('auto-test')){
                    let has = entries.some(e => e.name == global.lang.TEST_STREAMS)
                    if(!has && this.canApplyStreamTesting(entries)){
                        entries.splice(1, 0, {
                            name: global.lang.TEST_STREAMS,
                            fa: 'fas fa-satellite-dish',
                            type: 'action',
                            action: () => {
                                global.streamState.test(entries, '', true)
                            }
                        })
                    }
                }
            }
        }
        entries = entries.map((e, i) => {
            e.tabindex = i
            return e
        })
        return entries
    }
    currentStreamEntries(includeMegaStreams){
        return this.currentEntries.filter(e => {
            if(e.url && (!e.type || e.type == 'stream' || e.type == 'select')) {
                return includeMegaStreams === true || !global.mega.isMega(e.url)
            }
        })
    }
    cleanEntries(entries, props){ // clean entries by removing specific props
        let nentries = []
        entries.forEach(e => {
            let n = Object.assign({}, e)
            props.split(',').forEach(prop => {
                if(typeof(n[prop]) != 'undefined'){
                    delete n[prop]
                }
            })
            nentries.push(n)
        })
        return nentries
    }
    render(es, path, parentEntryOrIcon, backTo){
        if(this.opts.debug){
            console.log('render', es, path, parentEntryOrIcon, backTo)
        }
        if(Array.isArray(es)){
            this.currentEntries = es.slice(0)
            this.currentEntries = this.addMetaEntries(this.currentEntries, path, backTo)
            this.currentEntries = this.currentEntries.map((e, i) => {
                if(!e.type){
                    e.type = 'stream'
                }
                if(typeof(e.path) != 'string'){
                    e.path = path || ''
                }
                if(e.path){
                    if(this.basename(e.path) != e.name){
                        e.path += '/'+ e.name
                    }
                }
                return e
            })
            this.pages[path] = this.currentEntries.slice(0)
            this.currentEntries = this.cleanEntries(this.currentEntries, 'renderer,entries,action')
            if(path && this.path != path) this.path = path
            this.syncPages()
        }
        if(this.rendering){
            const icon = typeof(parentEntryOrIcon) == 'string' ? parentEntryOrIcon : (parentEntryOrIcon ? parentEntryOrIcon.fa : 'fas fa-home')
            global.ui.emit('render', this.cleanEntries(this.checkFlags(this.currentEntries), 'checked,users,terms'), path, icon)
            this.emit('render', this.currentEntries, path, parentEntryOrIcon, backTo)
        }
    }
    suspendRendering(){
        this.rendering = false
    }
    resumeRendering(){
        this.rendering = true
    }
    chooseFile(mimeTypes='*') {
        return new Promise((resolve, reject) => {
            const id = 'explorer-choose-file-'+ parseInt(10000000 * Math.random())
            global.ui.once(id, data => {
                if(data == null) return reject('File not selected')
                global.ui.resolveFileFromClient(data).then(resolve).catch(reject)
            })
            global.ui.emit('open-file', global.ui.uploadURL, id, mimeTypes)
        })
    }
}

module.exports = Explorer
