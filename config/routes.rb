Rails.application.routes.draw do
  root "home#index"

  get "robots.txt" => "seo#robots", as: :robots, defaults: { format: :text }
  get "sitemap.xml" => "seo#sitemap", as: :sitemap, defaults: { format: :xml }
  get "llms.txt" => "seo#llms", as: :llms, defaults: { format: :text }
  get "manifest.json" => "rails/pwa#manifest", as: :pwa_manifest, defaults: { format: :json }

  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render the service worker from app/views/pwa/* if offline support is added later.
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
  # root "posts#index"
end
