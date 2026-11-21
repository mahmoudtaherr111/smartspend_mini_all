#
# The iOS side of device_lock for CocoaPods builds; Swift Package Manager builds read device_lock/Package.swift.
#
Pod::Spec.new do |s|
  s.name             = 'device_lock'
  s.version          = '0.0.1'
  s.summary          = 'The app lock: biometrics bound to the Keychain, the PIN key, and the app switcher cover.'
  s.description      = <<-DESC
The app lock: biometrics bound to the Keychain, the PIN key, and the app switcher cover.
                       DESC
  s.homepage         = 'https://github.com/mahmoudtaherr111/smartspend_mini_all'
  s.license          = { :type => 'Proprietary' }
  s.author           = { 'SmartSpend' => '' }
  s.source           = { :path => '.' }
  s.source_files = 'device_lock/Sources/device_lock/**/*.swift'
  s.dependency 'Flutter'
  s.platform = :ios, '15.0'
  s.frameworks = 'LocalAuthentication', 'Security'

  # Flutter.framework does not contain a i386 slice.
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'i386' }
  s.swift_version = '5.0'
end
