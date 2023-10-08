const Events = require('events')

const DownloadStreamHttp = require('./stream-http')
const DownloadStreamCache = require('./stream-cache')
const DownloadStreamBase = require('./stream-base')

class DownloadStream extends DownloadStreamBase {
	constructor(ropts, opts){
		super(ropts)
		this.ropts = ropts
		this.opts = opts
        this.timeout = opts.timeout
	}
	validate(response){
		return response.statusCode >= 200 && response.statusCode < 400 && 
			![204].includes(response.statusCode) // softly ignore these ones
	}
    async start(){
        if(this.started){
            throw 'Already started'
        }
        if(this.ended){
            throw 'Already ended'
        }
        if(this.destroyed){
            throw 'Already destroyed'
        }
        const types = [DownloadStreamHttp]
        if(typeof(this.opts.cacheTTL) == 'number' && this.opts.cacheTTL > 0) {
            types.unshift(DownloadStreamCache)
        }
        let chosen, responseData
        const vias = types.map((t, i) => {
            const opts = Object.assign({}, this.ropts)
            const via = new t(opts)
            via.once('error', (err, report) => {
                (report || via == chosen) && console.error(err)
            })
            via.once('response', response => {
                if(chosen){
                    return via.destroy()
                }
                via.validation = [response, this.validate(response)]
                if(this.validate(response)){
                    chosen = via
                    vias.filter(v => v != via).forEach(v => v.destroy())
                    response.headers['x-megacubo-dl-source'] = via.type
                    this.emit('response', response)
                    if(response.ended){
                        this.end()
                    } else {
                        response.once('end', () => this.end())
                    }
                } else {
                    if(via.type == 'http') {
                        responseData = {
                            statusCode: response.statusCode,
                            headers: response.headers
                        }
                    }
                }
            })
            via.once('destroy', () => {
                if(chosen) return
                process.nextTick(() => {
                    if(vias.every(v => v.destroyed)){
                        if(responseData){
                            responseData.headers['x-megacubo-dl-source'] = '' //vias
                            const response = new DownloadStreamBase.Response(responseData.statusCode, responseData.headers)
                            this.emit('response', response)
                            response.end()
                            this.end()
                        } else {
                            const err = vias.filter(v => v.type == 'http').map(v => v.errors.length ? v.errors[0] : null).pop() || 'Failed to fetch.'
                            this.emitError(err)
                        }
                    }
                })
            })
            return via
        })
    }
}

DownloadStream.lookup = DownloadStreamHttp.lookup
DownloadStream.engines = {
    http: require('./stream-http'),
    cache: require('./stream-cache')
}

module.exports = DownloadStream
