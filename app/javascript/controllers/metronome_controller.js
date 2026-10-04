import { Controller } from "@hotwired/stimulus"

const STORAGE_KEY = "metronome.settings.v1"
const MIN_BPM = 40
const MAX_BPM = 240
const DEFAULTS = Object.freeze({
  bpm: 120,
  volume: 70,
  numerator: 4,
  denominator: 4,
  globalElapsedMs: 0
})

export default class extends Controller {
  static targets = [
    "bpm", "status", "toggle", "toggleLabel", "transportIcon",
    "sessionTimer", "globalTimer", "quickButton", "numerator",
    "denominator", "signatureOutput", "volume", "volumeOutput"
  ]

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
    this.scheduledNodes = new Set()
    this.currentBeat = 0

    this.renderSettings()
    this.renderTimers()
    this.renderTransport()
  }

  disconnect() {
    this.finishPlayback()
    this.audioContext?.close()
    this.audioContext = null
  }

  async toggle() {
    if (this.playing) {
      this.stop()
    } else {
      await this.start()
    }
  }

  async start() {
    if (this.playing || this.starting) return

    this.starting = true

    try {
      this.ensureAudioContext()
      await this.audioContext.resume()

      this.playing = true
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

  stop() {
    if (!this.playing) return

    const now = performance.now()
    this.sessionElapsedMs = now - this.sessionStartedAt
    this.globalElapsedMs += now - this.globalStartedAt
    this.playing = false
    this.clearPlaybackLoops()
    this.cancelScheduledNotes()
    this.audioContext?.suspend()
    this.renderTimers()
    this.renderTransport()
    this.persistState()
  }

  selectTempo(event) {
    this.setBpm(Number(event.currentTarget.dataset.bpm))
  }

  changeVolume() {
    this.volume = this.clamp(Number(this.volumeTarget.value), 0, 100)
    this.volumeOutputTarget.textContent = `${this.volume}%`
    this.persistState()
  }

  changeSignature() {
    this.numerator = this.clamp(Number(this.numeratorTarget.value), 1, 12)
    this.denominator = Number(this.denominatorTarget.value)
    this.signatureOutputTarget.textContent = `${this.numerator}/${this.denominator}`
    this.persistState()
    this.rescheduleFromDownbeat()
  }

  resetGlobalTimer() {
    this.globalElapsedMs = 0

    if (this.playing) {
      this.globalStartedAt = performance.now()
    }

    this.renderTimers()
    this.persistState()
  }

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

  persistBeforeUnload() {
    this.persistState()
  }

  prepareForCache() {
    this.finishPlayback()
  }

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

  renderTransport() {
    this.element.classList.toggle("is-playing", this.playing)
    this.statusTarget.textContent = this.playing ? "Playing" : "Stopped"
    this.toggleTarget.setAttribute("aria-pressed", this.playing.toString())
    this.toggleLabelTarget.textContent = this.playing ? "Stop" : "Start"
    this.transportIconTarget.textContent = this.playing ? "■" : "▶"
  }

  renderTimers() {
    const now = performance.now()
    const session = this.playing ? now - this.sessionStartedAt : this.sessionElapsedMs
    const global = this.playing ? this.globalElapsedMs + now - this.globalStartedAt : this.globalElapsedMs

    this.sessionTimerTarget.textContent = this.formatDuration(session)
    this.globalTimerTarget.textContent = this.formatDuration(global)
  }

  startTimerRendering() {
    const render = () => {
      if (!this.playing) return

      this.renderTimers()
      this.animationFrameId = requestAnimationFrame(render)
    }

    render()
  }

  ensureAudioContext() {
    if (this.audioContext) return

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) throw new Error("Web Audio API is not supported")

    this.audioContext = new AudioContextClass()
  }

  startScheduler() {
    this.scheduler()
    this.schedulerId = window.setInterval(() => this.scheduler(), 25)
  }

  scheduler() {
    if (!this.playing || !this.audioContext) return

    while (this.nextNoteTime < this.audioContext.currentTime + 0.1) {
      this.scheduleClick(this.currentBeat === 0, this.nextNoteTime)
      this.nextNoteTime += 60 / this.bpm
      this.currentBeat = (this.currentBeat + 1) % this.numerator
    }
  }

  scheduleClick(accented, time) {
    const oscillator = this.audioContext.createOscillator()
    const gain = this.audioContext.createGain()
    const peakVolume = (this.volume / 100) * (accented ? 0.24 : 0.16)

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

  rescheduleFromDownbeat() {
    if (!this.playing || !this.audioContext) return

    this.cancelScheduledNotes()
    this.currentBeat = 0
    this.nextNoteTime = this.audioContext.currentTime + 0.03
    this.scheduler()
  }

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

  clearPlaybackLoops() {
    window.clearInterval(this.schedulerId)
    window.clearInterval(this.persistIntervalId)
    cancelAnimationFrame(this.animationFrameId)
    this.schedulerId = null
    this.persistIntervalId = null
    this.animationFrameId = null
  }

  finishPlayback() {
    if (this.playing) {
      const now = performance.now()
      this.sessionElapsedMs = now - this.sessionStartedAt
      this.globalElapsedMs += now - this.globalStartedAt
      this.playing = false
    }

    this.clearPlaybackLoops()
    this.cancelScheduledNotes()
    this.persistState()
  }

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

  loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
      return saved && typeof saved === "object" ? { ...DEFAULTS, ...saved } : DEFAULTS
    } catch (_error) {
      return DEFAULTS
    }
  }

  clamp(value, minimum, maximum) {
    const numericValue = Number(value)
    return Math.min(maximum, Math.max(minimum, Number.isFinite(numericValue) ? numericValue : minimum))
  }

  formatDuration(milliseconds) {
    const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":")
  }
}
