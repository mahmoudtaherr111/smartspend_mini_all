Pod::Spec.new do |s|
  s.name             = 'ios_liquid_glass'
  s.version          = '0.0.1'
  s.summary          = 'Native iOS Liquid Glass tab bar platform view for SmartSpend.'
  s.description      = <<-DESC
Native iOS floating Liquid Glass tab bar using iOS 26 UIGlassEffect with iOS 15-18 UIBlurEffect fallback.
                       DESC
  s.homepage         = 'https://smartspend.app'
  s.license          = { :type => 'MIT' }
  s.author           = { 'SmartSpend AI' => 'engineering@smartspend.app' }
  s.source           = { :path => '.' }
  s.source_files     = 'ios_liquid_glass/Sources/ios_liquid_glass/**/*.swift'
  s.dependency 'Flutter'
  s.platform = :ios, '15.0'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'i386'
  }
  s.swift_version = '5.0'
  s.resource_bundles = {
    'ios_liquid_glass_privacy' => ['ios_liquid_glass/Sources/ios_liquid_glass/PrivacyInfo.xcprivacy']
  }
end
