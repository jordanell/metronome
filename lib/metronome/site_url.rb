require "uri"

module Metronome
  class SiteUrl
    LOCAL_FALLBACK = "http://localhost:3000"

    def self.normalize(value, production:)
      candidate = value.to_s.strip

      if candidate.empty?
        raise ArgumentError, "SITE_URL is required in production" if production

        candidate = LOCAL_FALLBACK
      end

      uri = URI.parse(candidate)

      unless uri.is_a?(URI::HTTP) && uri.host && !uri.host.empty? && uri.userinfo.nil? &&
          [ "", "/" ].include?(uri.path) && uri.query.nil? && uri.fragment.nil?
        raise ArgumentError, "SITE_URL must be an absolute origin without a path, query, fragment, or credentials"
      end

      if production && uri.scheme != "https"
        raise ArgumentError, "SITE_URL must use HTTPS in production"
      end

      uri.scheme = uri.scheme.downcase
      uri.host = uri.host.downcase
      uri.path = ""
      uri.to_s
    rescue URI::InvalidURIError
      raise ArgumentError, "SITE_URL must be a valid absolute URL"
    end
  end
end
