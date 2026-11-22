import Flutter
import UIKit

class SceneDelegate: FlutterSceneDelegate {
  override func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    for context in connectionOptions.urlContexts {
      SmartSpendShareBridge.handleIncomingUrl(context.url)
    }
    super.scene(scene, willConnectTo: session, options: connectionOptions)
  }

  override func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    var handledShare = false
    for context in URLContexts {
      if SmartSpendShareBridge.handleIncomingUrl(context.url) {
        handledShare = true
      }
    }
    if !handledShare {
      super.scene(scene, openURLContexts: URLContexts)
    }
  }
}
