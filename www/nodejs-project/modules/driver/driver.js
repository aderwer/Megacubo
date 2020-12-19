module.exports = (file, opts) => {
	const skipWorkerThreads = ((opts && opts.skipWorkerThreads) || (!global.cordova && typeof(Worker) != 'undefined')), workerData = {file, paths, APPDIR}
	if(typeof(global.lang) != 'undefined'){
		workerData.lang = global.lang
	}
	if(opts && opts.bytenode){
		workerData.bytenode = true
	}
	class WorkerThreadDriver {
		constructor(){
			this.err = null
			this.promises = {}
			this.Worker = require('worker_threads').Worker
			this.worker = new this.Worker(global.APPDIR + '/modules/driver/worker.js', {workerData, stdout: true, stderr: true})
			this.worker.on('error', err => {
				let serr = String(err)
				this.err = err
				console.error('error ' + file, serr)
				if(serr.match(new RegExp('(out of memory|out_of_memory)', 'i'))){
					let msg = 'Worker #' + file.split('/').pop() + ' exitted out of memory, fix the settings and restart the app.'
					global.osd.show(msg, 'fas fa-exclamation-triagle faclr-red', 'out-of-memory', 'persistent')
				}
				if(typeof(err.preventDefault) == 'function'){
					err.preventDefault()
				}
			}, true, true)
			this.worker.on('exit', () => {
				console.warn('Worker exit. ' + file, this.err)
			})
			this.worker.on('message', ret => {
				if(ret.id !== 0){
					if(ret.id && typeof(this.promises[ret.id]) != 'undefined'){
						this.promises[ret.id][ret.type](ret.data)
						delete this.promises[ret.id]
					} else {
						console.error('Worker error', file, ret)
					}
				}
			})
			return new Proxy(this, {
				get: (self, method) => {
					if(method in self){
						return self[method]
					}
					return (...args) => {
						return new Promise((resolve, reject) => {
							let id
							for(id = 1; typeof(self.promises[id]) != 'undefined'; id++);
							self.promises[id] = {resolve, reject}
							try {
								self.worker.postMessage({method, id, args})
							} catch(e) {
								console.error(e, {method, id, args})
							}
						})
					}
				}
			})
		}
	}
	class WebWorkerDriver {
		constructor(){
			this.err = null
			this.promises = {}
			this.worker = new Worker(global.APPDIR + '/modules/driver/web-worker.js', {name: JSON.stringify(workerData)})
			this.worker.onerror = err => {
				let serr = String(err)
				this.err = err
				console.error('error ' + file, serr)
				if(serr.match(new RegExp('(out of memory|out_of_memory)', 'i'))){
					let msg = 'Worker #' + file.split('/').pop() + ' exitted out of memory, fix the settings and restart the app.'
					global.osd.show(msg, 'fas fa-exclamation-triagle faclr-red', 'out-of-memory', 'persistent')
				}
				if(typeof(err.preventDefault) == 'function'){
					err.preventDefault()
				}
				return true
			}
			this.worker.onmessage = e => {
				const ret = e.data
				if(ret.id !== 0){
					if(ret.id && typeof(this.promises[ret.id]) != 'undefined'){
						this.promises[ret.id][ret.type](ret.data)
						delete this.promises[ret.id]
					} else {
						console.error('Worker error', ret)
					}
				} else if(ret.type && ret.type == 'event') {
					if(ret.data == 'config-change'){
						global.config.reload()
					}
				}
			}
			global.config.on('change', () => {
				console.log('CONFIG CHANGED!')
				this.worker.postMessage({method: 'configChange', id: 0})
			})
			return new Proxy(this, {
				get: (self, method) => {
					if(method in self){
						return self[method]
					}
					return (...args) => {
						return new Promise((resolve, reject) => {
							let id
							for(id = 1; typeof(self.promises[id]) != 'undefined'; id++);
							self.promises[id] = {resolve, reject}
							try {
								self.worker.postMessage({method, id, args})
							} catch(e) {
								console.error(e, {method, id, args})
							}
						})
					}
				}
			})
		}
	}
	function hasWorkerThreads(){				
		try {
			if(require.resolve('worker_threads')){
				require('worker_threads')
				return true
			}
		} catch(e) { }		
	}
	if(skipWorkerThreads === true || !hasWorkerThreads()){
		if(typeof(Worker) != 'undefined'){
			return WebWorkerDriver
		} else {
			return require(file) // load inline
		}
	} else {
		return WorkerThreadDriver
	}
}
