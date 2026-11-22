// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "ios_liquid_glass",
    platforms: [
        .iOS("15.0")
    ],
    products: [
        .library(name: "ios-liquid-glass", targets: ["ios_liquid_glass"])
    ],
    dependencies: [
        .package(name: "FlutterFramework", path: "../FlutterFramework")
    ],
    targets: [
        .target(
            name: "ios_liquid_glass",
            dependencies: [
                .product(name: "FlutterFramework", package: "FlutterFramework")
            ],
            resources: [
                .process("PrivacyInfo.xcprivacy")
            ]
        )
    ]
)
