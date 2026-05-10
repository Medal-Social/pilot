cask "medal-social" do
  arch arm: "aarch64", intel: "x64"

  version "1.0.1"
  sha256 arm:   "9608e1ea47ddfe736ae062c4aebfdcf6c3ff1bd21125ddeed519f5331854a9bc",
         intel: "0c3e50a36229fa2a2af76dea53132fa39769242b568f72bc3917de30efb63e4f"

  url "https://github.com/Medal-Social/Desktop/releases/download/desktop-v#{version}/Medal-Social_#{version}_#{arch}.dmg",
      verified: "github.com/Medal-Social/Desktop/"
  name "Medal Social"
  desc "Medal Social Desktop"
  homepage "https://medalsocial.com/"

  livecheck do
    url "https://github.com/Medal-Social/Desktop/releases.atom"
    regex(/desktop[._-]v?(\d+(?:\.\d+)+)/i)
    strategy :page_match
  end

  auto_updates true

  app "Medal Social.app"

  zap trash: [
    "~/Library/Application Support/Medal Social",
    "~/Library/Caches/com.medalsocial.desktop",
    "~/Library/Preferences/com.medalsocial.desktop.plist",
    "~/Library/Saved Application State/com.medalsocial.desktop.savedState",
  ]
end
