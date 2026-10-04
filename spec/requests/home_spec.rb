require "rails_helper"

RSpec.describe "Home", type: :request do
  describe "GET /" do
    it "renders the complete metronome interface" do
      get root_path

      document = Capybara.string(response.body)

      expect(response).to have_http_status(:ok)
      expect(document).to have_css("h1", text: "Metronome", exact_text: true)
      expect(document).to have_css("[data-controller='metronome']")
      expect(document).to have_css("[data-metronome-target='bpm']", text: "120", exact_text: true)
      expect(document).to have_css("[data-metronome-target='sessionTimer']", text: "00:00:00", exact_text: true)
      expect(document).to have_css("[data-metronome-target='globalTimer']", text: "00:00:00", exact_text: true)
      expect(document).to have_css("button[data-metronome-target='quickButton']", count: 21)
      expect(document).to have_css("select#signature-numerator option", count: 12)
      expect(document).to have_css("select#signature-denominator option", count: 4)
      expect(document).to have_css("input#volume-control[min='0'][max='100'][value='70']")
      expect(document).to have_css(
        "button[data-metronome-target='toggle'][aria-pressed='false']",
        text: "Start"
      )
    end
  end
end
