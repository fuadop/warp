import Arweave from 'arweave';
import { HandlerBasedContract, Contract, SmartWeave, SmartWeaveBuilder } from '@smartweave/contract';
import {
  CacheableContractInteractionsLoader,
  CacheableExecutorFactory,
  CacheableStateEvaluator,
  Evolve
} from '@smartweave/plugins';
import {
  ContractDefinitionLoader,
  ContractInteractionsLoader,
  DefaultStateEvaluator,
  EvalStateResult,
  HandlerApi,
  HandlerExecutorFactory,
  LexicographicalInteractionsSorter
} from '@smartweave/core';
import { BsonFileBlockHeightSwCache, MemBlockHeightSwCache, MemCache } from '@smartweave/cache';

/**
 * A factory that simplifies the process of creating different versions of {@link SmartWeave}.
 * All versions use the {@link Evolve} plugin.
 * SmartWeave instances created by this factory can be safely used in a web environment.
 */
export class SmartWeaveWebFactory {
  /**
   * Returns a fully configured {@link SmartWeave} that is using mem cache for all layers.
   */
  static memCached(arweave: Arweave): SmartWeave {
    return this.memCachedBased(arweave).build();
  }

  /**
   * Returns a preconfigured, memCached {@link SmartWeaveBuilder}, that allows for customization of the SmartWeave instance.
   * Use {@link SmartWeaveBuilder.build()} to finish the configuration.
   */
  static memCachedBased(arweave: Arweave): SmartWeaveBuilder {
    const definitionLoader = new ContractDefinitionLoader(arweave, new MemCache());

    const interactionsLoader = new CacheableContractInteractionsLoader(
      new ContractInteractionsLoader(arweave),
      new MemBlockHeightSwCache()
    );

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(arweave, new MemBlockHeightSwCache<EvalStateResult<unknown>>(), [
      new Evolve(definitionLoader, executorFactory)
    ]);

    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return SmartWeave.builder(arweave)
      .setDefinitionLoader(definitionLoader)
      .setInteractionsLoader(interactionsLoader)
      .setInteractionsSorter(interactionsSorter)
      .setExecutorFactory(executorFactory)
      .setStateEvaluator(stateEvaluator);
  }

  /**
   * Returns a fully configured, nonCached {@link SmartWeave}.
   */
  static nonCached(arweave: Arweave): SmartWeave {
    return this.nonCachedBased(arweave).build();
  }

  /**
   * Returns a preconfigured {@link SmartWeave} that (yup, you've guessed it!) does not use any caches.
   * This one is gonna be slooow!
   * Use {@link SmartWeaveBuilder.build()} to finish the configuration.
   */
  static nonCachedBased(arweave: Arweave): SmartWeaveBuilder {
    const definitionLoader = new ContractDefinitionLoader(arweave);
    const interactionsLoader = new ContractInteractionsLoader(arweave);
    const executorFactory = new HandlerExecutorFactory(arweave);
    const stateEvaluator = new DefaultStateEvaluator(arweave, [new Evolve(definitionLoader, executorFactory)]);
    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return SmartWeave.builder(arweave)
      .setDefinitionLoader(definitionLoader)
      .setInteractionsLoader(interactionsLoader)
      .setInteractionsSorter(interactionsSorter)
      .setExecutorFactory(executorFactory)
      .setStateEvaluator(stateEvaluator);
  }
}