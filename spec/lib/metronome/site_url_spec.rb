require "spec_helper"
require_relative "../../../lib/metronome/site_url"

RSpec.describe Metronome::SiteUrl do
  describe ".normalize" do
    it "normalizes a production HTTPS origin" do
      expect(described_class.normalize(" HTTPS://Example.COM/ ", production: true))
        .to eq("https://example.com")
    end

    it "uses a safe local fallback outside production" do
      expect(described_class.normalize(nil, production: false))
        .to eq("http://localhost:3000")
    end

    it "requires SITE_URL in production" do
      expect { described_class.normalize(nil, production: true) }
        .to raise_error(ArgumentError, "SITE_URL is required in production")
    end

    it "requires HTTPS in production" do
      expect { described_class.normalize("http://example.com", production: true) }
        .to raise_error(ArgumentError, "SITE_URL must use HTTPS in production")
    end

    it "rejects paths, queries, fragments, credentials, and malformed URLs" do
      invalid_values = [
        "https://example.com/metronome",
        "https://example.com?source=test",
        "https://example.com#top",
        "https://user:password@example.com",
        "not a URL"
      ]

      invalid_values.each do |value|
        expect { described_class.normalize(value, production: true) }.to raise_error(ArgumentError)
      end
    end
  end
end
