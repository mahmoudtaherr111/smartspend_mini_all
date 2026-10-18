/// The SmartSpend API as the mobile app sees it: the procedure catalog generated from `api/router.ts`, a tRPC
/// client that calls it over HTTP, and the one event stream outside tRPC the app follows (phone challenges).
library;

export 'src/api_exception.dart';
export 'src/generated/procedures.g.dart';
export 'src/phone_challenge_events.dart';
export 'src/procedure.dart';
export 'src/trpc_client.dart';
