import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/config/app_config.dart';

void main() {
  test('a debug build reaches the development server from the emulator', () {
    final android = AppConfig.resolve(
      environment: 'development',
      apiUrl: '',
      isReleaseBuild: false,
      platform: 'android',
    );
    final ios = AppConfig.resolve(
      environment: 'development',
      apiUrl: '',
      isReleaseBuild: false,
      platform: 'ios',
    );

    expect(android.apiBaseUri, Uri.parse('http://10.0.2.2:3000'));
    expect(ios.apiBaseUri, Uri.parse('http://localhost:3000'));
    expect(android.userAgent, 'SmartSpend-Mobile (android; development)');
  });

  test('a release build without an API address refuses to start', () {
    expect(
      () => AppConfig.resolve(
        environment: 'production',
        apiUrl: '',
        isReleaseBuild: true,
        platform: 'android',
      ),
      throwsStateError,
    );
  });

  test('a release build refuses plain HTTP', () {
    expect(
      () => AppConfig.resolve(
        environment: 'production',
        apiUrl: 'http://api.example.test',
        isReleaseBuild: true,
        platform: 'ios',
      ),
      throwsStateError,
    );
  });

  test('a release build takes the address it was given', () {
    final config = AppConfig.resolve(
      environment: 'production',
      apiUrl: 'https://api.example.test',
      isReleaseBuild: true,
      platform: 'ios',
    );

    expect(config.apiBaseUri.host, 'api.example.test');
    expect(config.isProduction, isTrue);
  });
}
