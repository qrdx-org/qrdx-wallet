module.exports = {
  expo: {
    name: "QRDX Wallet",
    slug: "qrdx-wallet",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#000000"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "org.qrdx.wallet"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#000000"
      },
      package: "org.qrdx.wallet"
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro"
    },
    plugins: [
      "expo-secure-store",
      "expo-crypto"
    ],
    extra: {
      eas: {
        projectId: "qrdx-wallet"
      }
    }
  }
}
