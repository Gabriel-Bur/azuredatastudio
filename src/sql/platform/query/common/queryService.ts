/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IConnection, ConnectionState, IConnectionService } from 'sql/platform/connection/common/connectionService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IDisposable, combinedDisposable, toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';

export const IQueryService = createDecorator<IQueryService>('queryService');

export interface IQueryProvider {
	readonly id: string;
	runQuery(connectionId: string, file: URI): Promise<void>;
}

export interface IQueryService {
	_serviceBrand: undefined;
	registerProvider(provider: IQueryProvider): IDisposable;
	/**
	 * Create a new query or return on if it already exists given the uri
	 * Will return undefined if the connection is not connected
	 * @param connection
	 * @param forceNew force create a new query even if one already exists for the given connection
	 * This should only be done if it is known that the connection supports multiple queries on the same connection (unlikely)
	 */
	createOrGetQuery(connection: IConnection, associatedURI?: URI, forceNew?: boolean): IQuery | undefined;
}

export interface IQuery {
	readonly connection: IConnection;
	readonly associatedFile?: URI;

	runQuery(): Promise<void>;
}

class Query implements IQuery {

	constructor(
		#queryService: QueryService,
		public readonly connection: IConnection,
		public readonly associatedFile?: URI
	) { }

	async runQuery(): Promise<void> {
		await this.queryService.runQuery(this.connection, this.associatedFile);
	}
}

export class QueryService extends Disposable implements IQueryService {
	_serviceBrand: undefined;

	private readonly queryProviders = new Map<string, { provider: IQueryProvider, disposable: IDisposable }>(); // providers that have been registered

	constructor(
		@IConnectionService private readonly connectionService: IConnectionService
	) {
		super();
	}

	createOrGetQuery(connection: IConnection, associatedURI?: URI, forceNew?: boolean): IQuery | undefined {
		return connection.state === ConnectionState.CONNECTED ? new Query(this, connection, associatedURI) : undefined;
	}

	registerProvider(provider: IQueryProvider): IDisposable {
		const disposable = combinedDisposable(
			toDisposable(() => this.queryProviders.delete(provider.id))
		);
		const providerStub = {
			disposable,
			provider
		};
		this.queryProviders.set(provider.id, providerStub);
		return disposable;
	}

	runQuery(connection: IConnection, file: URI): Promise<void> {
		const providerStub = this.queryProviders.get(connection.provider);
		if (!providerStub) {
			throw new Error(`Provider could not be found: ${connection.provider}`);
		}
		const connectionId = this.connectionService.getIdForConnection(connection);
		return providerStub.provider.runQuery(connectionId, file);
	}
}

registerSingleton(IQueryService, QueryService, true);