
class StreamerPlaybackTimeout extends EventEmitter {
    constructor(controls, app){
        super()
        this.app = app
        this.controls = controls
        this.playbackTimeout = 25000
        this.playbackTimeoutTimer = 0
        this.on('state', s => {
            if(s == 'loading'){
                if(!this.playbackTimeoutTimer){
                    this.playbackTimeoutTimer = setTimeout(() => {
                        clearTimeout(this.playbackTimeoutTimer)
                        this.app.emit('video-error', 'timeout', this.prepareErrorData({type: 'timeout', details: 'client playback timeout'}))
                    }, this.playbackTimeout)
                }
            } else {
                this.cancelTimeout()
            }
        })        
        this.on('stop', () => {
            this.cancelTimeout()
        })
        this.app.on('streamer-reset-timeout', err => {
            clearTimeout(this.playbackTimeoutTimer)
            this.playbackTimeoutTimer = 0
        })
    }
    cancelTimeout(){
        osd.hide('debug-timeout')
        osd.hide('timeout')
        clearTimeout(this.playbackTimeoutTimer)
        this.playbackTimeoutTimer = 0
        if(this.isTryOtherDlgActive()){
            explorer.endModal()
        }
    }
    isTryOtherDlgActive(){
        return !!document.getElementById('modal-template-option-wait')
    }
    ended(){
        clearTimeout(this.playbackTimeoutTimer)
        /*
        let v = this.object()
        if(v.currentTime > 60){
            this.app.emit('video-ended', v.currentTime, v.duration)
        } else {
            this.app.emit('video-error', 'playback', this.prepareErrorData({type: 'timeout', details: 'client playback ended after '+ v.currentTime + 's'}))
        }
        */
    }
    prepareErrorData(data){
        return {type: data.type || 'playback', details: data.details || ''}
    }
    time(){
        return ((new Date()).getTime() / 1000)
    }
}

class StreamerOSD extends StreamerPlaybackTimeout {
    constructor(controls, app){
        super(controls, app)
        this.transmissionNotWorkingHintDelay = 10000
        this.transmissionNotWorkingHintTimer = 0
        this.state = 'loading'
        this.osdID = 'video'
        this.OSDNameShown = false
        this.on('draw', () => {
            this.OSDLoadingHintShown = false
        })
        this.on('state', (s) => {
            switch(s){
                case 'ended':
                    clearTimeout(this.transmissionNotWorkingHintTimer)
                    this.OSDNameShown = false
                    osd.hide(this.osdID + '-sub')
                    osd.show(lang.ENDED, 'fas fa-play', this.osdID, 'persistent')
                    break
                case 'paused':
                    clearTimeout(this.transmissionNotWorkingHintTimer)
                    this.OSDNameShown = false
                    osd.hide(this.osdID + '-sub')
                    osd.show(lang.PAUSED, 'fas fa-play', this.osdID, 'persistent')
                    break
                case 'loading':
                    osd.hide(this.osdID) // clear paused osd
                    clearTimeout(this.transmissionNotWorkingHintTimer)
                    this.transmissionNotWorkingHintTimer = setTimeout(() => {
                        if(this.active){
                            osd.show(lang.TRANSMISSION_NOT_WORKING_HINT.format(this.tuningIcon), '', this.osdID + '-sub', 'persistent')
                            osd.hide(this.osdID)
                        }
                    }, this.transmissionNotWorkingHintDelay)
                    break
                case 'playing':
                    clearTimeout(this.transmissionNotWorkingHintTimer)
                    osd.hide('video-slow')
                    osd.hide(this.osdID + '-sub')
                    osd.hide(this.osdID)
                    if(!this.OSDNameShown){
                        this.OSDNameShown = true
                        osd.show(this.data.name, this.data.servedIcon || '', this.osdID, 'normal')
                    }
                    break
                case '':
                    osd.hide(this.osdID + '-sub')
                    osd.hide(this.osdID)
            }
        })        
        this.on('stop', () => {
            clearTimeout(this.transmissionNotWorkingHintTimer)
            this.OSDNameShown = false
            osd.hide(this.osdID + '-sub')
            osd.hide(this.osdID)
        })
    }    
}

class StreamerState extends StreamerOSD {
    constructor(controls, app){
        super(controls, app)
        this.state = ''
        this.stateListener = (s, data) => {
            if(s != this.state){
                this.state = s
                console.log('STREAMER-STATE', this.state)
                switch(this.state){
                    case 'paused':
                        this.controls.querySelector('.play-button').style.display = 'block'
                        this.controls.querySelector('.loading-button').style.display = 'none'
                        this.controls.querySelector('.pause-button').style.display = 'none'
                        break
                    case 'loading':
                        this.controls.querySelector('.play-button').style.display = 'none'
                        this.controls.querySelector('.loading-button').style.display = 'block'
                        this.controls.querySelector('.pause-button').style.display = 'none'
                        break
                    case 'playing':
                        this.controls.querySelector('.play-button').style.display = 'none'
                        this.controls.querySelector('.loading-button').style.display = 'none'
                        this.controls.querySelector('.pause-button').style.display = 'block'
                        break
                    case 'ended':                    
                        this.controls.querySelector('.play-button').style.display = 'block'
                        this.controls.querySelector('.loading-button').style.display = 'none'
                        this.controls.querySelector('.pause-button').style.display = 'none'
                        break
                    case 'error':                    
                        this.app.emit('video-error', 'playback', this.prepareErrorData({type: 'playback', details: String(data) || 'playback error'}))
                        this.stop(true) // stop silently, to let server handle the video-error
                    case '':
                        this.stop()
                        break
                }
                this.emit('state', this.state)
            }
        }
        this.bindStateListener()
    }
    bindStateListener(){
        if(!parent.player.listeners().includes(this.stateListener)){
            parent.player.on('state', this.stateListener)
        }
    } 
    unbindStateListener(){
        console.log('STREAMER-UNBINDSTATELISTENER')
        parent.player.removeListener('state', this.stateListener)
    }
    playOrPause(){
        if(this.active){
            let b = jQuery(this.controls).css('bottom')
            if(b == 0 || b == '0px'){
                if(['paused', 'ended'].includes(parent.player.state)){
                    parent.player.resume()
                    this.app.emit('streamer-resume')
                } else if(parent.player.state) {
                    parent.player.pause()
                    this.app.emit('streamer-pause')
                }
            }
        }
    }
}

class StreamerTranscode extends StreamerState { // request stream transcode 
    constructor(controls, app){
        super(controls, app)
        if(!parent.cordova){
            parent.player.on('request-transcode', () => this.app.emit('video-transcode'))
        }
    }
}

class StreamerUnmuteHack extends StreamerTranscode { // unmute player on browser restrictions
    constructor(controls, app){
        super(controls, app)
        if(!parent.cordova){
            jQuery(document).one('touchstart mousedown', () => {
                console.log('unmute player on browser restrictions')
                parent.player.container.querySelectorAll('video, audio').forEach(e => {
                    e.muted = false
                })
            })
        }
    }
}

class StreamerClientVideoAspectRatio extends StreamerUnmuteHack {
    constructor(container, app){
        super(container, app)
        this.aspectRatioList = [
            {h: 16, v: 9},
            {h: 4, v: 3},
            {h: 16, v: 10},
            {h: 21, v: 9}
        ]
        this.activeAspectRatio = this.aspectRatioList[0]
        this.lanscape = window.innerWidth > window.innerHeight
        window.addEventListener('resize', () => {
            let landscape = window.innerWidth > window.innerHeight
            if(landscape != this.landscape){ // orientation changed
                this.landscape = landscape
                setTimeout(() => this.applyAspectRatio(this.activeAspectRatio), 500) // give a delay to avoid confusion
            } else {
                this.applyAspectRatio(this.activeAspectRatio)
            }
        })
        parent.player.on('setup-ratio', r => {
            console.log('SETUP-RATIO', r)
            this.setupAspectRatio()
        })
        this.app.on('ratio', () => {
            this.switchAspectRatio()
        })
        this.on('stop', () => {
            this.aspectRatioList = this.aspectRatioList.filter(m => typeof(m.custom) == 'undefined')
            this.activeAspectRatio = this.aspectRatioList[0]
        })
    }
    generateAspectRatioMetrics(r){
        let h = r, v = 1
        while(h < Number.MAX_SAFE_INTEGER && (!Number.isSafeInteger(h) || !Number.isSafeInteger(v))){
            v++
            h = v * r;
        }
        console.log('generateAspectRatioMetrics', r, {v, h})
        return {v, h}
    }
    registerAspectRatio(metrics){
        let found = this.aspectRatioList.some(m => {
            return (m.v == metrics.v && m.h == metrics.h)
        })
        if(!found){
            metrics.custom = true
            this.aspectRatioList.push(metrics)
        }
        return metrics
    }
    detectAspectRatio(){
        return parent.player.videoRatio()
    }
    setupAspectRatio(){
        let r = this.detectAspectRatio(), metrics = this.generateAspectRatioMetrics(r)
        this.applyAspectRatio(metrics)
        this.registerAspectRatio(metrics)
    }
    switchAspectRatio(){
        var nxt = this.aspectRatioList[0], i = this.aspectRatioList.indexOf(this.activeAspectRatio)
        if(i < (this.aspectRatioList.length - 1)){
            nxt = this.aspectRatioList[i + 1]
        }
        console.log('RATIO', nxt, this.activeAspectRatio, i, this.aspectRatioList)
        this.applyAspectRatio(nxt)
    }
    applyAspectRatio(r){
        this.activeAspectRatio = r        
        parent.player.ratio(r.h / r.v)
    }
}

class StreamerBodyIdleClass extends StreamerClientVideoAspectRatio {
    constructor(controls, app){
        super(controls, app)
        const rx = new RegExp('(^| )video[\\-a-z]*', 'g'), rx2 = new RegExp('(^| )idle', 'g')
        this.on('stop', s => {
            let c = document.body.className
            c = c.replace(rx, ' ')
            document.body.className = c.trim()
        })
        this.on('state', s => {
            let c = document.body.className
            if(s && s != 'error'){
                c = c.replace(rx, ' ') + ' video video-' + s
            } else {
                c = c.replace(rx, ' ')
            }
            document.body.className = c.trim()
        });
        window.addEventListener('idle-start', () => {
            let c = document.body.className || ''
            if(!c.match(rx2)){
                document.body.className += ' idle'
            }
        })
        window.addEventListener('idle-stop', () => {
            let c = document.body.className || ''
            if(c.match(rx2)){
                document.body.className = c.replace(rx2, ' ').trim()
            }
        }) 
    }   
}

class StreamerSpeedo extends StreamerBodyIdleClass {
    constructor(controls, app){
        super(controls, app)
        this.invalidSpeeds = ['N/A', 0]
        this.on('state', state => {
            switch(state){
                case 'loading':
                    this.startSpeedo()
                    break
                case 'paused':
                    this.endSpeedo()
                    this.seekbarLabel.innerHTML = lang.PAUSED
                    break
                case 'ended':
                    this.endSpeedo()
                    this.seekbarLabel.innerHTML = lang.ENDED
                    break
                default:
                    this.endSpeedo()
                    this.seekbarLabel.innerHTML = lang.WAITING_CONNECTION
            }
        })
        this.app.on('speedo', this.speedoUpdate.bind(this))
    }
    startSpeedo(){
        let clientSpeed = navigator.connection && navigator.connection.downlink ? navigator.connection.downlink : 0
        if(clientSpeed){ // mbs to bits
            clientSpeed = clientSpeed * (1024 * 1024)
        }
        this.app.emit('speedo-start', clientSpeed)
    }
    endSpeedo(){
        this.app.emit('speedo-end')
    }
    speedoUpdate(speed, bitrate, starting){
        if(parent.player.state == 'loading'){
            let lowSpeedThreshold = (250 * 1024) /* 250kbps */, clientSpeed = navigator.connection && navigator.connection.downlink ? navigator.connection.downlink : 0
            if(clientSpeed){ // mbs to bits
                clientSpeed = clientSpeed * (1024 * 1024)
                if(clientSpeed < speed){
                    clientSpeed = speed
                }
            }
            if(this.invalidSpeeds.includes(speed)) {
                this.seekbarLabel.innerHTML = lang.WAITING_CONNECTION
            } else {
                let t = ''
                if(bitrate && !this.invalidSpeeds.includes(bitrate)){
                    let p = parseInt(speed / (bitrate / 100))
                    if(p > 100){
                        p = 100
                    }
                    if(clientSpeed && clientSpeed < bitrate){ // client connection is the throattling factor
                        t += lang.YOUR_CONNECTION + ': '
                    } else { // slow server?
                        t += lang.SERVER_CONNECTION + ': '
                    }
                    t += p + '%'
                    if(p < 80){
                        t = '<span class="faclr-red">' + t + '</span>'
                    } else if(p < 90){
                        t = '<span class="faclr-orange">' + t + '</span>'
                    } else {
                        t = '<span class="faclr-green">' + t + '</span>'
                    }
                } else {
                    t += lang.SERVER_CONNECTION + ': ' + kbsfmt(speed)
                    if(speed <= lowSpeedThreshold){
                        if(starting){
                            t = lang.WAITING_CONNECTION
                        } else {
                            t = '<span class="faclr-red">' + t + '</span>'
                        }
                    }
                }
                this.seekbarLabel.innerHTML = t
            }
        }
    }
}

class StreamerSeek extends StreamerSpeedo {
    constructor(controls, app){
        super(controls, app)
        this.seekOsdID = 'seek-osd-id'
        this.seekOsdTime = 1000
        this.seekCounter = 0
        this.seekCounterDelay = 2000
        this.seekSkipSecs = 5
        this.seekbar = false
        this.seekBarShowTime = 5000
        this.seekBarShowTimer = 0
        this.seekStepDelay = 400
        this.on('draw', () => {
            this.seekbar = this.controls.querySelector('seekbar')
            this.seekbarLabel = this.controls.querySelector('label.status')
            this.seekbarNput = this.seekbar.querySelector('input')
            this.seekbarNputVis = this.seekbar.querySelector('div#seek-active')
            this.seekbarNputDeadVis = this.seekbar.querySelector('div#seek-dead')
            this.seekbarNput.addEventListener('input', () => {
                if(this.active){
                    console.log('INPUTINPUT', this.seekbarNput.value)
                    this.seekByPercentage(this.seekbarNput.value)
                }
            })
            window.addEventListener('idle-stop', this.seekBarUpdate.bind(this))  
            this.seekBarUpdate(true)
        })
        parent.player.on('timeupdate', this.seekBarUpdate.bind(this))
        parent.player.on('play', () => {
            this.seekBarUpdate(true)
        })
    }    
    hmsPrependZero(n){
        if (n < 10){
            n = '0'+ n
        }
        return n
    }
    hms(secs){
        let sec_num = parseInt(secs, 10) // don't forget the second param
        let hours   = this.hmsPrependZero(Math.floor(sec_num / 3600))
        let minutes = this.hmsPrependZero(Math.floor((sec_num - (hours * 3600)) / 60))
        let seconds = this.hmsPrependZero(sec_num - (hours * 3600) - (minutes * 60))
        return hours + ':' + minutes + ':' + seconds
    }
    seekBarUpdate(force){
        if(this.active && this.state){
            if(!['paused', 'ended', 'loading'].includes(parent.player.state) || force === true){
                if(this.seekbarNput && (!window.isIdle || parent.player.state != 'playing' || force === true)){
                    let percent = this.seekCurrentPlaybackPercentage(), d = parent.player.duration()
                    this.seekbarLabel.innerHTML = this.hms(parent.player.time()) +' <font style="opacity: var(--opacity-level-2);">/</font> '+ this.hms(d)
                    if(percent != this.lastPercent){
                        this.seekBarUpdateView(percent)
                    }
                }
            }
        }
    }
    seekBarUpdateView(percent, duration){
        if(this.active && this.state){
            if(typeof(duration) != 'number'){
                duration = parent.player.duration()
            }
            this.lastPercent = percent
            if(percent == 100 && isNaN(duration)){
                percent = 0
            }
            let deadPercent = this.seekDeadPercentage(null, duration)
            this.seekbarNputDeadVis.style.width = deadPercent +'%'
            this.seekbarNputVis.style.width = (percent - deadPercent) +'%'
        }
    }
    seekBarUpdateSpeed(){
        if(this.active && this.seekbarNput && parent.player.state == 'loading'){
            let percent = this.seekCurrentPlaybackPercentage(), duration = parent.player.duration()
            this.seekbarLabel.innerText = this.hms(parent.player.time()) +' / '+ this.hms(duration)
            if(percent != this.lastPercent){
                this.seekBarUpdateView(percent)
            }
        }
    }
    seekCurrentPlaybackPercentage(){
        if(!this.active) return 0
        let time = parent.player.time(), duration = parent.player.duration()
        let percent = time / (duration / 100)
        if(isNaN(percent) || percent > 100){ // ?!
            percent = 100
        }
        return parseInt(percent)
    }
    seekTimeFromPercentage(percent){
        if(!this.active) return 0
        let time = parent.player.time(), duration = parent.player.duration()
        let ret = this.seekTimeCap(percent * (duration / 100), time, duration)
        console.log('SEEK PERCENT', percent, time, duration, ret)
        return ret
    }
    seekByPercentage(percent){        
        if(this.active){
            let s = this.seekTimeFromPercentage(percent)
            parent.player.time(s)
            this.app.emit('streamer-seek', s)
            this.seekBarUpdate(true)
        }
    }
    seekDeadTime(time, duration){ // from which point we can't backward seeking anymore
        if(!this.active) return 0
        let minTime = 0
        if(typeof(time) != 'number'){
            time = parent.player.time()
        }
        if(typeof(duration) != 'number'){
            duration = parent.player.duration()
        }
        if(this.activeMimetype && this.activeMimetype.indexOf('mpegurl') != -1){
            minTime = duration - config['live-window-time']
            if(minTime < 0){
                minTime = 0
            }
        }
        return minTime
    }
    seekDeadPercentage(time, duration){ // from which point we can't backward seeking anymore
        if(!this.active) return 0
        if(typeof(time) != 'number'){
            time = parent.player.time()
        }
        if(typeof(duration) != 'number'){
            duration = parent.player.duration()
        }
        let minTime = this.seekDeadTime(time, duration)
        let ret = Math.ceil(minTime / (duration / 100))
        console.log('SEEK DEADPERCENT', minTime, duration, ret)
        return ret
    }
    seekTimeCap(s, time, duration){
        if(!this.active) return 0
        if(typeof(time) != 'number'){
            time = parent.player.time()
        }
        if(typeof(duration) != 'number'){
            duration = parent.player.duration()
        }
        let minTime = this.seekDeadTime(time, duration)
        if(s < minTime){
            s = minTime
        }
        let maxTime = duration - 2
        if(s > maxTime){
            s = maxTime
        }
        return s
    }
    seekBack(){
        if(this.active && !this.seekLocked){
            this.seekLocked = true
            this.seekCounter -= this.seekSkipSecs
            setTimeout(() => {
                this.seekLocked = false
            }, this.seekStepDelay) 
            clearTimeout(this.seekCounterTimer)
            this.seekCounterTimer = setTimeout(() => {
                this.seekCounter = 0
            }, this.seekCounterDelay) 
            let now = parent.player.time(), nct = this.seekTimeCap(now - this.seekSkipSecs, now)
            if(nct < now){
                parent.player.time(nct)
                let txt = lang.SEEKREWIND
                if(this.seekCounter < 0){
                    txt += ' ' + Math.abs(this.seekCounter) + 's'
                }
                osd.show(txt, 'fas fa-backward', this.seekOsdID, this.seekOsdTime)
            } else {
                osd.show(lang.PLAY, 'fas fa-play', this.seekOsdID, this.seekOsdTime)
            }
        }
    }
    seekFwd(){
        if(this.active && this.state == 'playing' && !this.seekLocked){
            this.seekLocked = true
            this.seekCounter += this.seekSkipSecs
            setTimeout(() => {
                this.seekLocked = false
            }, this.seekStepDelay) 
            clearTimeout(this.seekCounterTimer)
            this.seekCounterTimer = setTimeout(() => {
                this.seekCounter = 0
            }, this.seekCounterDelay) 
            let now = parent.player.time(), nct = this.seekTimeCap(now + this.seekSkipSecs, now)
            if(nct > now){
                parent.player.time(nct)
                let txt = lang.SEEKFORWARD
                if(this.seekCounter > 0){
                    txt += ' ' + this.seekCounter + 's'
                }
                osd.show(txt, 'fas fa-forward', this.seekOsdID, this.seekOsdTime)
            } else {
                osd.show(lang.PLAY, 'fas fa-play', this.seekOsdID, this.seekOsdTime)
            }
        }
    }
}

class StreamerClientVideoFullScreen extends StreamerSeek {
    constructor(controls, app){
        super(controls, app)
        let b = this.controls.querySelector('button.fullscreen')
        if(config['startup-window'] != 'fullscreen'){
            this.inFullScreen = false
            if(parent.cordova){
                parent.AndroidFullScreen.showUnderStatusBar(() => {}, console.error);
                parent.AndroidFullScreen.showUnderSystemUI(() => {}, console.error);
                parent.plugins.megacubo.on('appmetrics', this.updateAndroidAppMetrics.bind(this))
                this.updateAndroidAppMetrics(parent.plugins.megacubo.appMetrics)
                this.on('fullscreenchange', this.updateAndroidAppMetrics.bind(this))
                if(b) b.style.display = 'none'
                this.on('start', () => this.enterFullScreen())
                this.on('stop', () => this.leaveFullScreen())
            } else {
                if(b) b.style.display = 'inline-flex'
            }
            this.on('fullscreenchange', fs => {
                if(fs){
                    $(document.body).addClass('fullscreen')
                } else {
                    $(document.body).removeClass('fullscreen')
                }
            })
        } else {
            this.inFullScreen = true
            $(document.body).addClass('fullscreen')
            if(b) b.style.display = 'none'
            this.enterFullScreen()
        }
    }
    updateAndroidAppMetrics(metrics){
        if(metrics){
            this.lastMetrics = metrics
        } else {
            metrics = this.lastMetrics
        }
        if(this.inFullScreen){
            css(' :root { --explorer-padding-top: 0px; --explorer-padding-bottom: 0px; --explorer-padding-right: 0px; --explorer-padding-left: 0px; } ', 'frameless-window')
        } else {
            css(' :root { --explorer-padding-top: ' + metrics.top + 'px; --explorer-padding-bottom: ' + metrics.bottom + 'px; --explorer-padding-right: ' + metrics.right + 'px; --explorer-padding-left: ' + metrics.left + 'px; } ', 'frameless-window')
        }
    }
    enterFullScreen(){
        if(parent.cordova){
            parent.AndroidFullScreen.immersiveMode(() => {}, console.error);
        } else {
            let e = parent.document.body // document.documentElement
            if (e.requestFullscreen) {
                e.requestFullscreen()
            } else if (e.msRequestFullscreen) {
                e.msRequestFullscreen()
            } else if (e.mozRequestFullScreen) {
                e.mozRequestFullScreen()
            } else if (e.webkitRequestFullscreen) {
                e.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT)
            }
        }
        this.inFullScreen = true
        this.emit('fullscreenchange', this.inFullScreen)
    }
    leaveFullScreen(){
        if(this.inFullScreen){
            this.inFullScreen = false
            if(parent.cordova){
                parent.AndroidFullScreen.showSystemUI(() => {}, console.error);
                parent.AndroidFullScreen.showUnderStatusBar(() => {}, console.error);
                parent.AndroidFullScreen.showUnderSystemUI(() => {}, console.error);
            } else {
                let e = parent.document // document.documentElement
                if (e.exitFullscreen) {
                    e.exitFullscreen()
                } else if (e.msExitFullscreen) {
                    e.msExitFullscreen()
                } else if (e.mozCancelFullScreen) {
                    e.mozCancelFullScreen()
                } else if (e.webkitExitFullscreen) {
                    e.webkitExitFullscreen()
                }
            }
            this.emit('fullscreenchange', this.inFullScreen)
        }
    }
    toggleFullScreen(){
        if(this.inFullScreen){
            this.leaveFullScreen()
        } else {
            this.enterFullScreen()
        }
    }
}

class StreamerAudioUI extends StreamerClientVideoFullScreen {
    constructor(controls, app){
        super(controls, app)
        this.app.on('codecData', codecData => {
            if(codecData.audio && !codecData.video){
                $(document.body).addClass('audio')
            } else {
                $(document.body).removeClass('audio')
            }
        })
        this.on('stop', () => {
            $(document.body).removeClass('audio')
        })
    }
}

class StreamerClientControls extends StreamerAudioUI {
    constructor(controls, app){
        super(controls, app)
        this.app.on('add-player-button', this.addPlayerButton.bind(this))
        this.app.on('update-player-button', this.updatePlayerButton.bind(this))
        this.app.on('enable-player-button', this.enablePlayerButton.bind(this))
        this.tuningIcon = 'fas fa-random'
        this.controls.innerHTML = `
    <seekbar>
        <input type="range" min="0" max="100" value="100" />
        <div>
            <div id="seek-dead"></div>
            <div id="seek-active"></div>
        </div>
    </seekbar>
    <div id="buttons">
        <button class="play-pause" title="${lang.PLAY} / ${lang.PAUSE}">
            <i class="fas fa-circle-notch fa-spin loading-button"></i>
            <i class="fas fa-play-circle play-button"></i>
            <i class="fas fa-pause-circle pause-button"></i>
        </button>
        <label class="status"></label>
        <span class="filler"></span>  
    </div>         
`
        this.controls.querySelector('button.play-pause').addEventListener('click', () => {
            this.playOrPause()
        })
        this.addPlayerButton('stop', lang.STOP, 'fas fa-stop-circle', 1, () => {
            this.stop()
        })
        this.addPlayerButton('tune', lang.TRY_OTHER, this.tuningIcon, -1, () => {
            this.stop()
            this.app.emit('tune')
        })
        this.addPlayerButton('ratio', lang.ASPECT_RATIO, 'fas fa-expand-alt', -1, () => {
            this.switchAspectRatio()
            let label = this.activeAspectRatio.custom ? lang.ORIGINAL : (this.activeAspectRatio.h + ':' + this.activeAspectRatio.v)
            osd.show(lang.ASPECT_RATIO +': '+ label, '', 'ratio', 'normal')
        }, 0.9)
        if(config['startup-window'] != 'fullscreen'){
            this.addPlayerButton('fullscreen', lang.FULLSCREEN, 'fas fa-expand', -1, () => {
                this.toggleFullScreen()
            }, 0.85)
        }
        this.addPlayerButton('info', lang.ABOUT, 'fas fa-ellipsis-v', -1, 'about', 0.74)
        this.controls.querySelectorAll('button').forEach(bt => {
            bt.addEventListener('touchstart', () => {
                explorer.focus(bt)
            })
        })
        this.emit('draw')
        $('#explorer').on('click', e => {
            if(e.target.id == 'explorer'){
                this.playOrPause()
            }
        })
    }
    addPlayerButton(cls, name, fa, position = -1, action, scale = -1){
        let container = this.controls.querySelector('#buttons'), id = cls.split(' ')[0], template = `
        <button id="${id}" class="${cls}" title="${name}">
            <i class="${fa}"></i>
            <label><span>${name}</span></label>
        </button>
`
        if(container.querySelector('#' + id)){
            return
        }
        if(scale != -1){
            template = template.replace('></i>', ' style="transform: scale('+ scale +')"></i>')
        }
        if(position == -1){
            $(container).append(template)
        } else if(position == 0){
            $(container).prepend(template)
        } else {
            let bts = $(container).find('button')
            if(bts.length){
                if(position) {
                    bts.eq(position - 1).after(template)
                } else {
                    $(container).prepend(template)
                }
            } else {
                $(container).append(template)
            }
        }
        let button = container.querySelector('#' + id)
        if(typeof(action) == 'function'){
            button.addEventListener('click', action)
        } else {
            button.addEventListener('click', () => {
                this.app.emit(action)
            })
        }
    }
    updatePlayerButton(id, name, fa, scale = -1){
        id = id.split(' ')[0]
        let container = this.controls.querySelector('#buttons')
        let button = container.querySelector('#' + id)
        if(name){
            button.querySelector('label span').innerText = name
        }
        if(fa){
            let template = `<i class="${fa}"></i>`
            if(scale != -1){
                template = template.replace('></i>', ' style="transform: scale('+ scale +')"></i>')
            }            
            $(button).find('i').replaceWith(template)
        }
    }
    enablePlayerButton(id, show){
        id = id.split(' ')[0]
        let container = this.controls.querySelector('#buttons')
        let button = container.querySelector('#' + id)
        button.style.display = show ? 'inline-flex' : 'none'
    }
}

class StreamerClientController extends StreamerClientControls {
    constructor(controls, app){
        super(controls, app)
        this.active = false
        parent.player.on('show', () => this.emit('show'))
        parent.player.on('hide', () => this.emit('hide'))
    }
    start(src, mimetype){
        this.active = true
        this.activeMimetype = (mimetype || '').toLowerCase()
        parent.player.load(src, mimetype, '')
        this.emit('start')
        this.stateListener('loading')
    }
    stop(fromServer){
        if(this.active){
            this.active = false
            this.activeMimetype = ''
            console.log('STOPCLIENT', fromServer, traceback())
            if(fromServer !== true){
                this.app.emit('stop')
            }
            parent.player.unload()
            this.emit('stop')
        }
    }
}

class StreamerClient extends StreamerClientController {
    constructor(controls, app){
        console.log('CONT', controls)
        super(controls, app)
        this.app = app
        this.bind()
    }
    errorCallback(src, mimetype){
        if(this.autoTuning && mimetype.indexOf('video/') == -1){ // seems live
            explorer.dialog([
                {template: 'question', text: '', fa: 'fas fa-question-circle'},
                {template: 'option', text: lang.PLAYALTERNATE, id: 'tune', fa: 'fas fa-random'},
                {template: 'option', text: lang.STOP, id: 'stop', fa: 'fas fa-stop-circle'},
                {template: 'option', text: lang.RETRY, id: 'retry', fa: 'fas fa-sync'}
            ], choose => {
                switch(choose){
                    case 'tune':
                        this.app.emit('tune')
                        break
                    case 'retry':
                        this.app.emit('retry')
                        break
                    default: // stop or false (dialog closed)
                        this.stop()
                        break
                }
                return true
            }, 'tune')
        }
    }
    bind(){
        this.app.on('pause', () => {
            console.warn('PAUSE')
            parent.player.pause()
        })
        this.app.on('tuneable', enable => {
            console.log('TUNEABLE', enable)
            let b = this.controls.querySelector('button.tune')
            if(b){
                b.style.display = enable ? 'inherit' : 'none'
            }
        })
        this.app.on('streamer-connect', (src, mimetype, data, autoTuning) => {
            this.bindStateListener()
            if(explorer.inModal()){
                explorer.endModal()
            }
            this.data = data
            this.autoTuning = autoTuning
            console.warn('CONNECT', src, mimetype, data, autoTuning)
            this.start(src, mimetype)
            osd.hide('streamer')
        })
        this.app.on('streamer-connect-suspend', () => { // used to wait for transcoding setup when supported codec is found on stream
            this.unbindStateListener()
            this.stateListener('loading')
        })
        this.app.on('streamer-disconnect', (err, autoTuning) => {
            console.warn('DISCONNECT', err, autoTuning)
            this.autoTuning = autoTuning
            this.stop(true)  
        })
    }
}