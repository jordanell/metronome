module ApplicationHelper
  SITE_TITLE = "Free Online Metronome – Adjustable BPM & Time Signatures"
  SITE_DESCRIPTION = "Practice with a free online metronome featuring adjustable 40–240 BPM, time signatures, volume controls, keyboard shortcuts, and session tracking."

  def site_url
    Rails.application.config.x.site_url
  end

  def canonical_url
    "#{site_url}/"
  end

  def social_image_url
    "#{site_url}/social-card.png"
  end

  def web_application_structured_data
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Metronome",
      url: canonical_url,
      description: SITE_DESCRIPTION,
      image: social_image_url,
      applicationCategory: "MusicApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript and Web Audio API support",
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      },
      featureList: [
        "Adjustable tempo from 40 to 240 BPM",
        "Configurable time signatures",
        "Volume controls",
        "Keyboard shortcuts",
        "Session and total playing-time tracking"
      ]
    }.to_json
  end
end
