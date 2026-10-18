/// The SmartSpend API as the mobile app sees it: the procedure catalog generated from `api/router.ts` and a
/// tRPC client that calls it over HTTP.
library;

export 'src/api_exception.dart';
export 'src/generated/procedures.g.dart';
export 'src/procedure.dart';
export 'src/trpc_client.dart';
