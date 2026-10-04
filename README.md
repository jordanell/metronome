# Metronome

A browser based metronome built with Rails and Stimulus.

## Requirements

- Ruby 4.0.6
- PostgreSQL 17
- Chrome or Chromium for system tests

## Setup

```sh
bin/setup
bin/rails server
```

The default local databases are `metronome_development` and `metronome_test`. Set `DATABASE_URL` when PostgreSQL is not available through the default local socket.

## Tests

```sh
RAILS_ENV=test bin/rails db:prepare
bundle exec rspec
bin/rubocop
```

## Search discovery setup

Production requires `SITE_URL` to be the public HTTPS origin with no path or trailing slash, for example:

```sh
SITE_URL=https://metronome.example
```

Optional ownership-verification tokens can be supplied through `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION`. Configure the deployment proxy to permanently redirect every alternate hostname and HTTP request to `SITE_URL`.

After deployment:

1. Verify `/robots.txt`, `/sitemap.xml`, `/llms.txt`, and `/manifest.json` on the public origin.
2. Register the origin with Google Search Console and Bing Webmaster Tools using the optional verification variables.
3. Submit `/sitemap.xml` in both services and request indexing for the homepage.

The crawler policy permits conventional and AI-search discovery while blocking crawler identities used specifically for model training. Review `app/views/seo/robots.text.erb` periodically because crawler names and policies can change.
