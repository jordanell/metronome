require "rails_helper"

RSpec.describe "Metronome", type: :system do
  before do
    visit root_path
    page.execute_script("localStorage.clear()")
    refresh
  end

  it "changes tempo with quick controls and arrow keys within its limits" do
    click_button "150"
    expect_bpm("150")

    find("body").send_keys(:arrow_up)
    expect_bpm("151")
    find("body").send_keys(:arrow_down)
    expect_bpm("150")

    click_button "240"
    find("body").send_keys(:arrow_up)
    expect_bpm("240")

    click_button "40"
    find("body").send_keys(:arrow_down)
    expect_bpm("40")
  end

  it "shows tap controls based on the device type rather than viewport width" do
    page.current_window.resize_to(375, 800)

    expect(page).to have_text("adjust by one")
    expect(page).to have_text("Press Space or Enter to start and stop")
    expect(page).to have_no_button("Decrease tempo by 1 BPM")
    expect(page).to have_no_button("Increase tempo by 1 BPM")

    original_user_agent = page.evaluate_script("navigator.userAgent")
    page.driver.browser.execute_cdp(
      "Network.setUserAgentOverride",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
    )
    refresh

    expect(page).to have_no_text("adjust by one")
    expect(page).to have_no_text("Press Space or Enter to start and stop")
    find("button[aria-label='Increase tempo by 1 BPM']").click
    expect_bpm("121")
    find("button[aria-label='Decrease tempo by 1 BPM']").click
    expect_bpm("120")
  ensure
    page.driver.browser.execute_cdp("Network.setUserAgentOverride", userAgent: original_user_agent) if original_user_agent
  end

  it "starts and stops from the keyboard while keeping both timers visible" do
    install_fake_audio_context

    find("body").send_keys(:space)
    expect_status("Playing")
    expect(page).to have_button("Stop")
    expect(page).to have_css("button[data-metronome-target='toggle'][aria-pressed='true']")
    expect(page).to have_css("[data-metronome-target='sessionTimer']", text: "00:00:00")
    expect(page).to have_css("[data-metronome-target='globalTimer']", text: "00:00:00")

    sleep 1.1
    expect(page).to have_css("[data-metronome-target='sessionTimer']", text: "00:00:01")
    expect(page).to have_css("[data-metronome-target='globalTimer']", text: "00:00:01")

    find("body").send_keys(:enter)
    expect_status("Stopped")
    frozen_session = timer_text("sessionTimer")
    frozen_global = timer_text("globalTimer")
    sleep 1.1
    expect(timer_text("sessionTimer")).to eq(frozen_session)
    expect(timer_text("globalTimer")).to eq(frozen_global)

    refresh
    expect_status("Stopped")
    expect(timer_text("sessionTimer")).to eq("00:00:00")
    expect(timer_text("globalTimer")).to eq(frozen_global)
  end

  it "keeps the screen awake while playing and reacquires the lock when visible again" do
    install_fake_audio_context
    install_fake_wake_lock

    click_button "Start"
    expect_status("Playing")
    expect(page.evaluate_script("window.__wakeLockRequests")).to eq([ "screen" ])

    set_document_visibility("hidden")
    page.execute_script("window.__wakeLocks[0].release()")
    set_document_visibility("visible")

    expect(page.evaluate_script("window.__wakeLockRequests")).to eq([ "screen", "screen" ])

    click_button "Stop"
    expect(page.evaluate_script("window.__wakeLockReleaseCount")).to eq(2)
  end

  it "keeps keyboard controls active when another control has focus" do
    install_fake_audio_context

    click_button "150"
    find("button[data-bpm='150']").send_keys(:arrow_up)
    expect_bpm("151")

    find("button[data-bpm='150']").send_keys(:space)
    expect_status("Playing")

    select "7", from: "Beats"
    find("#signature-numerator").send_keys(:arrow_down)
    expect_bpm("150")

    find("#signature-numerator").send_keys(:enter)
    expect_status("Stopped")
  end

  it "persists tempo, volume, and time signature" do
    click_button "180"
    select "7", from: "Beats"
    select "8", from: "Note"
    set_volume(35)

    expect(page).to have_css("[data-metronome-target='signatureOutput']", text: "7/8")
    expect(page).to have_css("[data-metronome-target='volumeOutput']", text: "35%")

    refresh

    expect_bpm("180")
    expect(find("#signature-numerator").value).to eq("7")
    expect(find("#signature-denominator").value).to eq("8")
    expect(find("#volume-control").value).to eq("35")
  end

  it "schedules an accented downbeat and ordinary beats" do
    install_fake_audio_context
    set_volume(100)
    click_button "Start"

    expect_status("Playing")
    expect(page.evaluate_script("window.__metronomeFrequencies.includes(1000)")).to be(true)
    expect(page.evaluate_script("window.__metronomePeakGains.includes(0.9)")).to be(true)

    sleep 0.6
    expect(page.evaluate_script("window.__metronomeFrequencies.includes(700)")).to be(true)
    expect(page.evaluate_script("window.__metronomePeakGains.includes(0.6)")).to be(true)

    click_button "Stop"
  end

  it "resets and persists the global timer without interrupting playback" do
    install_fake_audio_context
    click_button "Start"
    sleep 1.1

    click_button "Reset global timer"

    expect_status("Playing")
    expect(timer_text("globalTimer")).to eq("00:00:00")
    expect(timer_text("sessionTimer")).to eq("00:00:01")

    click_button "Stop"
    refresh
    expect(timer_text("globalTimer")).to eq("00:00:00")
  end

  private
    def expect_bpm(value)
      expect(page).to have_css("[data-metronome-target='bpm']", text: value, exact_text: true)
    end

    def expect_status(value)
      expect(page).to have_css("[data-metronome-target='status']", text: /\A#{Regexp.escape(value)}\z/i)
    end

    def timer_text(target)
      find("[data-metronome-target='#{target}']").text
    end

    def set_volume(value)
      page.execute_script(<<~JAVASCRIPT, value)
        const input = document.querySelector("#volume-control")
        input.value = arguments[0]
        input.dispatchEvent(new Event("input", { bubbles: true }))
      JAVASCRIPT
    end

    def install_fake_audio_context
      page.execute_script(<<~JAVASCRIPT)
        window.__metronomeFrequencies = []
        window.__metronomePeakGains = []
        window.AudioContext = class {
          constructor() {
            this.startedAt = performance.now() / 1000
            this.destination = {}
          }

          get currentTime() { return performance.now() / 1000 - this.startedAt }
          resume() { return Promise.resolve() }
          suspend() { return Promise.resolve() }
          close() { return Promise.resolve() }

          createOscillator() {
            return {
              frequency: {
                setValueAtTime(value) { window.__metronomeFrequencies.push(value) }
              },
              connect() {},
              start() {},
              stop() {},
              addEventListener() {}
            }
          }

          createGain() {
            return {
              gain: {
                setValueAtTime(value) { window.__metronomePeakGains.push(value) },
                exponentialRampToValueAtTime() {}
              },
              connect() {}
            }
          }
        }
      JAVASCRIPT
    end

    def install_fake_wake_lock
      page.execute_script(<<~JAVASCRIPT)
        window.__wakeLockRequests = []
        window.__wakeLockReleaseCount = 0
        window.__wakeLocks = []

        Object.defineProperty(navigator, "wakeLock", {
          configurable: true,
          value: {
            request(type) {
              window.__wakeLockRequests.push(type)

              const wakeLock = new EventTarget()
              wakeLock.released = false
              wakeLock.release = function() {
                if (!this.released) {
                  this.released = true
                  window.__wakeLockReleaseCount += 1
                  this.dispatchEvent(new Event("release"))
                }
                return Promise.resolve()
              }

              window.__wakeLocks.push(wakeLock)
              return Promise.resolve(wakeLock)
            }
          }
        })
      JAVASCRIPT
    end

    def set_document_visibility(state)
      page.execute_script(<<~JAVASCRIPT, state)
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: arguments[0]
        })
        document.dispatchEvent(new Event("visibilitychange"))
      JAVASCRIPT
    end
end
