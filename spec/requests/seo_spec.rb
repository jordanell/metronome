require "rails_helper"

RSpec.describe "SEO discovery", type: :request do
  let(:site_url) { "https://metronome.example" }

  around do |example|
    original_site_url = Rails.application.config.x.site_url
    Rails.application.config.x.site_url = site_url
    example.run
  ensure
    Rails.application.config.x.site_url = original_site_url
  end

  describe "GET /" do
    it "renders complete server-side search and social metadata" do
      get root_path

      document = Capybara.string(response.body)
      expected_title = "Free Online Metronome – Adjustable BPM & Time Signatures"
      expected_description = "Practice with a free online metronome featuring adjustable 40–240 BPM, time signatures, volume controls, keyboard shortcuts, and session tracking."

      expect(response).to have_http_status(:ok)
      expect(document).to have_css("html[lang='en']")
      expect(document).to have_css("title", text: expected_title, exact_text: true, visible: :all)
      expect(document).to have_css("meta[name='description'][content='#{expected_description}']", visible: :all)
      expect(document).to have_css("meta[name='robots'][content='index,follow,max-image-preview:large']", visible: :all)
      expect(document).to have_css("link[rel='canonical'][href='#{site_url}/']", visible: :all)
      expect(document).to have_css("link[rel='manifest'][href='/manifest.json']", visible: :all)
      expect(document).to have_css("meta[property='og:title'][content='#{expected_title}']", visible: :all)
      expect(document).to have_css("meta[property='og:url'][content='#{site_url}/']", visible: :all)
      expect(document).to have_css("meta[property='og:image'][content='#{site_url}/social-card.png']", visible: :all)
      expect(document).to have_css("meta[name='twitter:card'][content='summary_large_image']", visible: :all)
      expect(document).to have_css("meta[name='twitter:image'][content='#{site_url}/social-card.png']", visible: :all)
    end

    it "renders valid WebApplication structured data without fabricated reviews" do
      get root_path

      document = Capybara.string(response.body)
      data = JSON.parse(document.find("script[type='application/ld+json']", visible: :all).text)

      expect(data).to include(
        "@context" => "https://schema.org",
        "@type" => "WebApplication",
        "name" => "Metronome",
        "url" => "#{site_url}/",
        "applicationCategory" => "MusicApplication",
        "isAccessibleForFree" => true
      )
      expect(data.dig("offers", "price")).to eq("0")
      expect(data).not_to include("aggregateRating", "review")
    end
  end

  describe "GET /robots.txt" do
    it "publishes the sitemap and separates search from training crawlers" do
      get robots_path

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("text/plain")
      expect(response.body).to include("User-agent: *\nAllow: /\nDisallow: /up")
      expect(response.body).to include("User-agent: OAI-SearchBot\nAllow: /")
      expect(response.body).to include("User-agent: Claude-SearchBot\nAllow: /")
      expect(response.body).to include("User-agent: GPTBot\nDisallow: /")
      expect(response.body).to include("User-agent: Google-Extended\nDisallow: /")
      expect(response.body).to include("User-agent: CCBot\nDisallow: /")
      expect(response.body).to include("Sitemap: #{site_url}/sitemap.xml")
    end
  end

  describe "GET /sitemap.xml" do
    it "publishes only the canonical homepage without a synthetic lastmod" do
      get sitemap_path

      document = Nokogiri::XML(response.body)
      namespace = { "sitemap" => "http://www.sitemaps.org/schemas/sitemap/0.9" }

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("application/xml")
      expect(document.errors).to be_empty
      expect(document.xpath("//sitemap:url/sitemap:loc", namespace).map(&:text)).to eq([ "#{site_url}/" ])
      expect(document.xpath("//sitemap:lastmod", namespace)).to be_empty
    end
  end

  describe "GET /llms.txt" do
    it "publishes a factual machine-readable app summary" do
      get llms_path

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("text/plain")
      expect(response.body).to include("# Metronome", "Canonical URL: #{site_url}/", "Adjustable tempo from 40 to 240 BPM")
    end
  end

  describe "GET /manifest.json" do
    it "publishes a valid installable web app manifest" do
      get pwa_manifest_path

      manifest = JSON.parse(response.body)

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("application/json")
      expect(manifest).to include(
        "id" => "/",
        "short_name" => "Metronome",
        "start_url" => "/",
        "scope" => "/",
        "theme_color" => "#0e0e10",
        "background_color" => "#0e0e10"
      )
      expect(manifest.fetch("icons").map { |icon| icon.fetch("sizes") }).to contain_exactly("192x192", "512x512")
    end
  end

  describe "discovery image assets" do
    def png_dimensions(path)
      File.binread(path, 24).unpack("x16NN")
    end

    it "provides all declared images at their expected dimensions" do
      expect(png_dimensions(Rails.root.join("public/icon-192.png"))).to eq([ 192, 192 ])
      expect(png_dimensions(Rails.root.join("public/icon-512.png"))).to eq([ 512, 512 ])
      expect(png_dimensions(Rails.root.join("public/apple-touch-icon.png"))).to eq([ 180, 180 ])
      expect(png_dimensions(Rails.root.join("public/social-card.png"))).to eq([ 1200, 630 ])
      expect(Rails.root.join("public/icon.svg")).to exist
    end
  end
end
