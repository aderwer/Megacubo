class AutoConfig {
    constructor(){}
    validateDomain(domain){
        return domain.indexOf('.') != -1 && domain.match(new RegExp('^[a-z0-9\.]{4,}'))
    }
    async start(){
        let data = await this.detect()
        if(data && data.domain && this.validateDomain(data.domain)){
            global.ui.emit('setup-skip-list')
            let allow = await this.confirm(data.domain)
            if(allow){
                this.apply(data)
                return true
            } else {
                if(!lists.manager.get().length && !global.config.get('shared-mode-reach')){
                    global.config.set('setup-complete', false)
                    global.ui.emit('setup-revert-skip-list')
                }                
            }
        }
    }
    async detect(){
        return await global.Download.promise({
            url: global.cloud.server +'/configure/auto',
            responseType: 'json'
        })
    }
    async confirm(domain){
        let opts = [
            {template: 'question', text: global.lang.AUTOCONFIG, fa: 'fas fa-magic'},
            {template: 'message', text: global.lang.AUTOCONFIG_WARN.format(domain)},
            {template: 'option', text: global.lang.ALLOW, fa: 'fas fa-check-circle', id: 'yes'},
            {template: 'option', text: global.lang.BLOCK, fa: 'fas fa-ban', id: 'no'}
        ], def = 'no'
        let ret = await global.explorer.dialog(opts, def)
        return ret == 'yes'
    }
    async confirmDisableLists(){
        let opts = [
            {template: 'question', text: global.lang.AUTOCONFIG, fa: 'fas fa-magic'},
            {template: 'message', text: global.lang.PROVIDER_DISABLE_LISTS},
            {template: 'option', text: global.lang.CONFIRM, fa: 'fas fa-check-circle', id: 'yes'},
            {template: 'option', text: global.lang.SKIP, fa: 'fas fa-times-circle', id: 'no'}
        ], def = 'no'
        let ret = await global.explorer.dialog(opts, def)
        return ret == 'yes'
    }
    shouldApplyM3U(data){ // prevent second dialog to show, if possible
        if(data.unique && global.config.get('shared-mode-reach')){
            return true
        }
        let lists = global.lists.manager.get()
        return lists.length != 1 || lists[0][1] != data.m3u
    }
    shouldConfirmDisableLists(data){ // prevent second dialog to show, if possible
        if(data.unique){
            if(global.config.get('shared-mode-reach')){
                return true
            }
            let lists = global.lists.manager.get()
            return lists.some(l => l[1] != data.m3u)
        }
    }
    async apply(data){
        console.log('autoConfigure', data)
        if(data['m3u'] && this.shouldApplyM3U(data)){
            console.log('autoConfigure', data['m3u'])
            global.ui.emit('setup-skip-list') // skip asking list on setup dialog
            if(data['unique'] && this.shouldConfirmDisableLists(data)){
                let unique = await this.confirmDisableLists()
                global.lists.manager.addList(data['m3u'], data['m3u_name'], unique).catch(console.error)
                if(unique){
                    global.config.set('shared-mode-reach', 0)
                    global.explorer.refresh()
                }
            } else {
                global.lists.manager.addList(data['m3u'], data['m3u_name']).catch(console.error)
            }
        }
        if(data['epg'] && data['epg'] != global.config.get('epg-'+ global.lang.locale)){
            global.epgSetup = true
            console.log('autoConfigure', data['epg'])
            global.config.set('epg-'+ global.lang.locale, data['epg'])
            global.lists.manager.setEPG(data['epg'], true)
            if(data['use-epg-channels-list']){
                if(global.activeEPG == data['epg']){
                    global.lists.manager.importEPGChannelsList(global.activeEPG).catch(console.error)
                }
            }
        }
        if(data['theme']){
            global.theme.applyRemoteTheme(data['theme'], data['theme-name'])
        }
        if(data['config-server'] && global.validateURL(data['config-server'])){ // as last one
            global.config.set('config-server', data['config-server'])
            global.options.clearCache()
        }
    }    
}

module.exports = AutoConfig