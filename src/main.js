/**
 * Browser entry point for the metronome. The Metronome controller connects the
 * page controls to Web Audio click scheduling, playback and elapsed-time display,
 * screen wake lock handling, and settings saved in localStorage. Its data-action
 * and data-metronome-target attributes provide the links to the page markup.
 */
import "./style.css"

const STORAGE_KEY = "metronome.settings.v1"
const MIN_BPM = 40
const MAX_BPM = 240
const ACCENTED_CLICK_GAIN = 0.9
const REGULAR_CLICK_GAIN = 0.6
const DEFAULTS = Object.freeze({
  bpm: 120,
  volume: 70,
  numerator: 4,
  denominator: 4,
  globalElapsedMs: 0
})

class Metronome {
  // Names used to look up the controller's elements in the page markup.
  static targets = [
    "bpm", "status", "toggle", "toggleLabel", "transportIcon",
    "sessionTimer", "globalTimer", "quickButton", "numerator",
    "denominator", "signatureOutput", "volume", "volumeOutput",
    "desktopShortcut", "mobileTempoControls"
  ]

  // Attach the controller to its root element and initialize its event handlers.
  constructor(element) {
    this.element = element
    this.connect()
    this.bindEvents()
  }

  // Connect declared element actions and browser lifecycle events to methods.
  bindEvents() {
    this.element.querySelectorAll("[data-action]").forEach((element) => {
      const action = element.dataset.action
      if (!action?.includes("metronome#")) return
      const method = action.split("metronome#")[1]
      const eventName = action.startsWith("input->") ? "input" : element.tagName === "SELECT" ? "change" : "click"
      element.addEventListener(eventName, (event) => this[method](event))
    })
    window.addEventListener("keydown", (event) => this.handleKeydown(event))
    window.addEventListener("beforeunload", () => this.persistBeforeUnload())
    window.addEventListener("pagehide", () => this.finishPlayback())
    document.addEventListener("visibilitychange", () => this.handleVisibilityChange())
  }

  // Restore settings, initialize playback state, and render the initial UI.
  connect() {
    const saved = this.loadState()

    this.bpm = this.clamp(saved.bpm, MIN_BPM, MAX_BPM)
    this.volume = this.clamp(saved.volume, 0, 100)
    this.numerator = this.clamp(saved.numerator, 1, 12)
    this.denominator = [2, 4, 8, 16].includes(saved.denominator) ? saved.denominator : DEFAULTS.denominator
    this.globalElapsedMs = Math.max(0, Number(saved.globalElapsedMs) || 0)
    this.sessionElapsedMs = 0
    this.playing = false
    this.starting = false
    this.audioContext = null
    this.schedulerId = null
    this.animationFrameId = null
    this.persistIntervalId = null
    this.wakeLock = null
    this.wakeLockRequest = null
    this.scheduledNodes = new Set()
    this.currentBeat = 0

    this.renderSettings()
    this.renderTimers()
    this.renderTransport()
    this.renderDeviceControls()
  }

  // Stop playback and release the audio context when the controller is removed.
  disconnect() {
    this.finishPlayback()
    this.audioContext?.close()
    this.audioContext = null
  }

  // Start or stop playback according to the current transport state.
  async toggle() {
    if (this.playing) {
      this.stop()
    } else {
      await this.start()
    }
  }

  // Resume audio and start click scheduling, timers, and periodic persistence.
  async start() {
    if (this.playing || this.starting) return

    this.starting = true

    try {
      this.ensureAudioContext()
      await this.audioContext.resume()

      this.playing = true
      this.requestWakeLock()
      this.sessionElapsedMs = 0
      this.sessionStartedAt = performance.now()
      this.globalStartedAt = this.sessionStartedAt
      this.currentBeat = 0
      this.nextNoteTime = this.audioContext.currentTime + 0.03
      this.startScheduler()
      this.startTimerRendering()
      this.persistIntervalId = window.setInterval(() => this.persistState(), 1000)
      this.renderTransport()
    } catch (error) {
      console.error("Unable to start metronome audio", error)
      this.statusTarget.textContent = "Audio unavailable"
    } finally {
      this.starting = false
    }
  }

  // Capture elapsed time, cancel pending work, and save the stopped state.
  stop() {
    if (!this.playing) return

    const now = performance.now()
    this.sessionElapsedMs = now - this.sessionStartedAt
    this.globalElapsedMs += now - this.globalStartedAt
    this.playing = false
    this.releaseWakeLock()
    this.clearPlaybackLoops()
    this.cancelScheduledNotes()
    this.audioContext?.suspend()
    this.renderTimers()
    this.renderTransport()
    this.persistState()
  }

  // Apply the BPM stored on a selected preset button.
  selectTempo(event) {
    this.setBpm(Number(event.currentTarget.dataset.bpm))
  }

  // Decrease the tempo by one BPM within the supported range.
  decreaseTempo() {
    this.setBpm(this.bpm - 1)
  }

  // Increase the tempo by one BPM within the supported range.
  increaseTempo() {
    this.setBpm(this.bpm + 1)
  }

  // Read the volume control, update its label, and save the setting.
  changeVolume() {
    this.volume = this.clamp(Number(this.volumeTarget.value), 0, 100)
    this.volumeOutputTarget.textContent = `${this.volume}%`
    this.persistState()
  }

  // Save the time signature and restart scheduling on a downbeat.
  changeSignature() {
    this.numerator = this.clamp(Number(this.numeratorTarget.value), 1, 12)
    this.denominator = Number(this.denominatorTarget.value)
    this.signatureOutputTarget.textContent = `${this.numerator}/${this.denominator}`
    this.persistState()
    this.rescheduleFromDownbeat()
  }

  // Clear accumulated time and restart its clock if playback is active.
  resetGlobalTimer() {
    this.globalElapsedMs = 0

    if (this.playing) {
      this.globalStartedAt = performance.now()
    }

    this.renderTimers()
    this.persistState()
  }

  // Handle keyboard shortcuts for tempo changes and playback.
  handleKeydown(event) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault()
      this.setBpm(this.bpm + (event.key === "ArrowUp" ? 1 : -1))
      return
    }

    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault()
      this.toggle()
    }
  }

  // Save the latest elapsed time before the page unloads.
  persistBeforeUnload() {
    this.persistState()
  }

  // Finish playback before the page is stored in a navigation cache.
  prepareForCache() {
    this.finishPlayback()
  }

  // Reacquire the screen wake lock when an active page becomes visible.
  handleVisibilityChange() {
    if (this.playing && document.visibilityState === "visible") {
      this.requestWakeLock()
    }
  }

  // Clamp and save a new tempo, update the UI, and reschedule active clicks.
  setBpm(value) {
    this.bpm = this.clamp(value, MIN_BPM, MAX_BPM)
    this.bpmTarget.textContent = this.bpm
    this.quickButtonTargets.forEach((button) => {
      const selected = Number(button.dataset.bpm) === this.bpm
      button.setAttribute("aria-pressed", selected.toString())
    })
    this.persistState()
    this.rescheduleFromDownbeat()
  }

  // Reflect the current tempo, volume, and time signature in the controls.
  renderSettings() {
    this.bpmTarget.textContent = this.bpm
    this.volumeTarget.value = this.volume
    this.volumeOutputTarget.textContent = `${this.volume}%`
    this.numeratorTarget.value = this.numerator
    this.denominatorTarget.value = this.denominator
    this.signatureOutputTarget.textContent = `${this.numerator}/${this.denominator}`
    this.quickButtonTargets.forEach((button) => {
      button.setAttribute("aria-pressed", (Number(button.dataset.bpm) === this.bpm).toString())
    })
  }

  // Reflect playback state in the transport button and status text.
  renderTransport() {
    this.element.classList.toggle("is-playing", this.playing)
    this.statusTarget.textContent = this.playing ? "Playing" : "Stopped"
    this.toggleTarget.setAttribute("aria-pressed", this.playing.toString())
    this.toggleLabelTarget.textContent = this.playing ? "Stop" : "Start"
    this.transportIconTarget.textContent = this.playing ? "■" : "▶"
  }

  // Show keyboard hints or touch tempo controls for the detected device.
  renderDeviceControls() {
    const mobileDevice = this.isMobileDevice()

    this.desktopShortcutTargets.forEach((element) => {
      element.hidden = mobileDevice
    })
    this.mobileTempoControlsTarget.hidden = !mobileDevice
  }

  // Detect mobile and touch-capable iPad devices for control layout.
  isMobileDevice() {
    if (navigator.userAgentData?.mobile) return true

    const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i
    const iPadOSDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1

    return mobileUserAgent.test(navigator.userAgent) || iPadOSDesktopMode
  }

  // Display current session time and cumulative elapsed time.
  renderTimers() {
    const now = performance.now()
    const session = this.playing ? now - this.sessionStartedAt : this.sessionElapsedMs
    const global = this.playing ? this.globalElapsedMs + now - this.globalStartedAt : this.globalElapsedMs

    this.sessionTimerTarget.textContent = this.formatDuration(session)
    this.globalTimerTarget.textContent = this.formatDuration(global)
  }

  // Refresh the visible timers on animation frames while playback continues.
  startTimerRendering() {
    const render = () => {
      if (!this.playing) return

      this.renderTimers()
      this.animationFrameId = requestAnimationFrame(render)
    }

    render()
  }

  // Create a Web Audio context on demand, or report unsupported browsers.
  ensureAudioContext() {
    if (this.audioContext) return

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) throw new Error("Web Audio API is not supported")

    this.audioContext = new AudioContextClass()
  }

  // Run the look-ahead click scheduler immediately and every 25 milliseconds.
  startScheduler() {
    this.scheduler()
    this.schedulerId = window.setInterval(() => this.scheduler(), 25)
  }

  // Queue beats up to 100 milliseconds ahead of the audio clock.
  scheduler() {
    if (!this.playing || !this.audioContext) return

    while (this.nextNoteTime < this.audioContext.currentTime + 0.1) {
      this.scheduleClick(this.currentBeat === 0, this.nextNoteTime)
      this.nextNoteTime += 60 / this.bpm
      this.currentBeat = (this.currentBeat + 1) % this.numerator
    }
  }

  // Schedule one short oscillator click, accenting the measure's first beat.
  scheduleClick(accented, time) {
    const oscillator = this.audioContext.createOscillator()
    const gain = this.audioContext.createGain()
    const peakVolume = (this.volume / 100) * (accented ? ACCENTED_CLICK_GAIN : REGULAR_CLICK_GAIN)

    oscillator.frequency.setValueAtTime(accented ? 1000 : 700, time)
    gain.gain.setValueAtTime(Math.max(peakVolume, 0.0001), time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)
    oscillator.connect(gain)
    gain.connect(this.audioContext.destination)
    oscillator.start(time)
    oscillator.stop(time + 0.055)

    const scheduled = { oscillator, gain }
    this.scheduledNodes.add(scheduled)
    oscillator.addEventListener("ended", () => this.scheduledNodes.delete(scheduled), { once: true })
  }

  // Cancel queued beats and restart the active measure after a setting change.
  rescheduleFromDownbeat() {
    if (!this.playing || !this.audioContext) return

    this.cancelScheduledNotes()
    this.currentBeat = 0
    this.nextNoteTime = this.audioContext.currentTime + 0.03
    this.scheduler()
  }

  // Stop any queued oscillator nodes and clear their tracking set.
  cancelScheduledNotes() {
    this.scheduledNodes.forEach(({ oscillator }) => {
      try {
        oscillator.stop()
      } catch (_error) {
        // The note may already have stopped naturally.
      }
    })
    this.scheduledNodes.clear()
  }

  // Cancel the scheduler, state-saving interval, and timer animation frame.
  clearPlaybackLoops() {
    window.clearInterval(this.schedulerId)
    window.clearInterval(this.persistIntervalId)
    cancelAnimationFrame(this.animationFrameId)
    this.schedulerId = null
    this.persistIntervalId = null
    this.animationFrameId = null
  }

  // Finalize elapsed time and release playback resources during page exit.
  finishPlayback() {
    if (this.playing) {
      const now = performance.now()
      this.sessionElapsedMs = now - this.sessionStartedAt
      this.globalElapsedMs += now - this.globalStartedAt
      this.playing = false
    }

    this.releaseWakeLock()
    this.clearPlaybackLoops()
    this.cancelScheduledNotes()
    this.persistState()
  }

  // Keep the visible screen awake during playback when the browser allows it.
  async requestWakeLock() {
    if (!this.playing || document.visibilityState !== "visible") return
    if (!navigator.wakeLock?.request || this.wakeLock || this.wakeLockRequest) return

    let request

    try {
      request = navigator.wakeLock.request("screen")
      this.wakeLockRequest = request
      const wakeLock = await request

      if (this.wakeLockRequest !== request || !this.playing || document.visibilityState !== "visible") {
        await wakeLock.release()
        return
      }

      this.wakeLock = wakeLock
      wakeLock.addEventListener("release", () => {
        if (this.wakeLock === wakeLock) this.wakeLock = null
      }, { once: true })
    } catch (_error) {
      // Playback still works when the browser or operating system denies the wake lock.
    } finally {
      if (this.wakeLockRequest === request) this.wakeLockRequest = null
    }
  }

  // Release the current screen wake lock and invalidate any pending request.
  releaseWakeLock() {
    this.wakeLockRequest = null

    const wakeLock = this.wakeLock
    this.wakeLock = null
    if (!wakeLock) return

    try {
      wakeLock.release().catch(() => {
        // The lock may already have been released by the browser.
      })
    } catch (_error) {
      // The lock may already have been released by the browser.
    }
  }

  // Save settings and cumulative elapsed time, tolerating unavailable storage.
  persistState() {
    const elapsed = this.playing
      ? this.globalElapsedMs + performance.now() - this.globalStartedAt
      : this.globalElapsedMs

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        bpm: this.bpm,
        volume: this.volume,
        numerator: this.numerator,
        denominator: this.denominator,
        globalElapsedMs: elapsed
      }))
    } catch (_error) {
      // The metronome still works when storage is blocked or unavailable.
    }
  }

  // Read saved settings and fill missing values from the defaults.
  loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
      return saved && typeof saved === "object" ? { ...DEFAULTS, ...saved } : DEFAULTS
    } catch (_error) {
      return DEFAULTS
    }
  }

  // Convert a value to a number and constrain it to the supplied bounds.
  clamp(value, minimum, maximum) {
    const numericValue = Number(value)
    return Math.min(maximum, Math.max(minimum, Number.isFinite(numericValue) ? numericValue : minimum))
  }

  // Format nonnegative elapsed milliseconds as hours:minutes:seconds.
  formatDuration(milliseconds) {
    const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":")
  }
}

// Provide singular and plural element lookup getters for each declared target.
for (const name of Metronome.targets) {
  Object.defineProperty(Metronome.prototype, `${name}Target`, {
    get() { return this.element.querySelector(`[data-metronome-target="${name}"]`) }
  })
  Object.defineProperty(Metronome.prototype, `${name}Targets`, {
    get() { return [...this.element.querySelectorAll(`[data-metronome-target="${name}"]`)] }
  })
}

// Mount the controller on the metronome page element.
new Metronome(document.querySelector('[data-controller="metronome"]'))
