import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/auth/google_identity.dart';

void main() {
  group('the nonce of a Google sign-in', () {
    test('is 43 base64url characters from 32 random bytes', () {
      final nonce = newGoogleNonce();
      expect(nonce, hasLength(43));
      expect(nonce, matches(RegExp(r'^[A-Za-z0-9_-]{43}$')));
    });

    test('is new for every sign-in', () {
      final nonces = {for (var i = 0; i < 200; i++) newGoogleNonce()};
      expect(nonces, hasLength(200));
    });

    test('comes from the random source it is given', () {
      expect(newGoogleNonce(Random(7)), newGoogleNonce(Random(7)));
      expect(newGoogleNonce(Random(7)), isNot(newGoogleNonce(Random(8))));
    });

    test('is the length auth.signInWithGoogle asks for (32 to 128)', () {
      final length = newGoogleNonce().length;
      expect(length, inInclusiveRange(32, 128));
    });

    test('is hashed as the server hashes it: SHA-256 in lowercase hex', () {
      // The same vector as api/lib/google-id-token.test.ts.
      expect(
        googleNonceHash('abc'),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });
  });
}
