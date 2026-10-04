require Rails.root.join("lib/metronome/site_url")

Rails.application.config.x.site_url = Metronome::SiteUrl.normalize(
  ENV["SITE_URL"],
  production: Rails.env.production?
)
