import { SolvixError } from "../errors";
import type { GraphQLError } from "../types";

/**
 * Error thrown when `throwOnError` is enabled and a GraphQL response contains errors.
 */
export class GraphQLClientError extends SolvixError {
    public readonly graphqlErrors: GraphQLError[];

    constructor(errors: GraphQLError[]) {
        const message = errors.map((e) => e.message).join("; ");
        super({ message });
        Object.setPrototypeOf(this, GraphQLClientError.prototype);
        this.name = "GraphQLClientError";
        this.graphqlErrors = errors;
    }
}
