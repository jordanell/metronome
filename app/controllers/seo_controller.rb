class SeoController < ApplicationController
  layout false

  def robots
    render formats: :text
  end

  def sitemap
    render formats: :xml
  end

  def llms
    render formats: :text
  end
end
