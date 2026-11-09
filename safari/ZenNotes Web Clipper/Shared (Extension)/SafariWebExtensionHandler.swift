//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  The extension asks this handler first ({ type: "clip", ... } through
//  browser.runtime.sendNativeMessage). Handing a clip straight to the
//  ZenNotes apps needs their side first (an App Group inbox the phone app
//  drains), so for now every clip is declined and the extension uses the
//  clipboard and zennotes:// link, as it does in other browsers. The note's
//  text is never logged.
//

import SafariServices

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let reply: [String: Any] = ["ok": false, "reason": "no-native-handoff"]
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: reply]
        } else {
            response.userInfo = ["message": reply]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

}
