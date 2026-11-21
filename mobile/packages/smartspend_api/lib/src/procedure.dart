/// A tRPC procedure of the SmartSpend API, as listed in `generated/procedures.g.dart`.
///
/// The kind decides the HTTP method: a query is a GET, a mutation a POST. Only the generated constants create
/// these, so the app cannot call a procedure the server does not have.
sealed class ApiProcedure {
  const ApiProcedure(this.path, {required this.builder, this.hasInput = false});

  /// The dotted path the server mounts it at, for example `expense.list`.
  final String path;

  /// The builder from `api/middleware.ts` it is declared with; it says who may call it.
  final String builder;

  /// Whether it declares an input schema.
  final bool hasInput;

  /// Whether a visitor without a session may call it.
  bool get isPublic =>
      builder == 'publicProcedure' || builder == 'strictPublicProcedure';

  @override
  String toString() => path;
}

/// A procedure that reads: sent as `GET /api/trpc/<path>?input=<json>`.
final class ApiQuery extends ApiProcedure {
  const ApiQuery(super.path, {required super.builder, super.hasInput});
}

/// A procedure that writes: sent as `POST /api/trpc/<path>` with a JSON body.
final class ApiMutation extends ApiProcedure {
  const ApiMutation(super.path, {required super.builder, super.hasInput});
}

/// A procedure that streams. The client does not speak subscriptions yet.
final class ApiSubscription extends ApiProcedure {
  const ApiSubscription(super.path, {required super.builder, super.hasInput});
}
