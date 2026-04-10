/**
 * Service Mesh — Categorical Module Registration.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * Exposes categorical computation (Functors, Natural Transformations,
 * Adjunctions) via the bus API. All operations execute inside GrafeoDB.
 *
 * @version 1.0.0
 */

import { register } from "../registry";

register({
  ns: "categorical",
  label: "Categorical Engine",
  layer: 1,
  operations: {
    applyFunctor: {
      handler: async (params: any) => {
        const { GraphFunctor } = await import(
          "@/modules/data/knowledge-graph/lib/categorical-engine"
        );
        if (!params?.id || !params?.sourceGraph || !params?.targetGraph) {
          throw new Error("Provide id, sourceGraph, targetGraph, and rules[]");
        }
        const functor = new GraphFunctor(
          params.id,
          params.sourceGraph,
          params.targetGraph,
          params.rules ?? [],
          params.covariant ?? true,
        );
        if (params.nodeIri) {
          const targetIri = await functor.apply(params.nodeIri);
          return { functorId: params.id, sourceIri: params.nodeIri, targetIri };
        }
        return functor.applyAll();
      },
      description:
        "Apply a functor between named graphs. Maps all objects or a single node.",
      paramsSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Functor identifier" },
          sourceGraph: { type: "string", description: "Source named graph IRI" },
          targetGraph: { type: "string", description: "Target named graph IRI" },
          rules: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: { type: "string" },
                operand: { type: "number" },
              },
            },
            description: "Morphism chain to apply per object",
          },
          nodeIri: {
            type: "string",
            description: "Optional: apply to a single node instead of all",
          },
          covariant: { type: "boolean" },
        },
        required: ["id", "sourceGraph", "targetGraph"],
      },
    },

    natTransform: {
      handler: async (params: any) => {
        const { GraphFunctor, GraphNatTransformation } = await import(
          "@/modules/data/knowledge-graph/lib/categorical-engine"
        );
        if (!params?.id || !params?.sourceFunctor || !params?.targetFunctor) {
          throw new Error("Provide id, sourceFunctor, targetFunctor configs");
        }
        const F = new GraphFunctor(
          params.sourceFunctor.id,
          params.sourceFunctor.sourceGraph,
          params.sourceFunctor.targetGraph,
          params.sourceFunctor.rules ?? [],
        );
        const G = new GraphFunctor(
          params.targetFunctor.id,
          params.targetFunctor.sourceGraph,
          params.targetFunctor.targetGraph,
          params.targetFunctor.rules ?? [],
        );
        const eta = new GraphNatTransformation(params.id, F, G);

        if (params.objectIri) {
          return eta.componentAt(params.objectIri);
        }
        // Compute components for all provided objects
        const objects: string[] = params.objects ?? [];
        const components = [];
        for (const obj of objects) {
          components.push(await eta.componentAt(obj));
        }
        return { transformationId: params.id, components };
      },
      description:
        "Compute natural transformation components between two functors.",
      paramsSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          sourceFunctor: { type: "object" },
          targetFunctor: { type: "object" },
          objectIri: { type: "string" },
          objects: { type: "array", items: { type: "string" } },
        },
        required: ["id", "sourceFunctor", "targetFunctor"],
      },
    },

    verifyNaturality: {
      handler: async (params: any) => {
        const { GraphFunctor, GraphNatTransformation } = await import(
          "@/modules/data/knowledge-graph/lib/categorical-engine"
        );
        if (!params?.transformId || !params?.objectA || !params?.objectB || !params?.morphism) {
          throw new Error("Provide transformId, objectA, objectB, morphism, sourceFunctor, targetFunctor");
        }
        const F = new GraphFunctor(
          params.sourceFunctor.id,
          params.sourceFunctor.sourceGraph,
          params.sourceFunctor.targetGraph,
          params.sourceFunctor.rules ?? [],
        );
        const G = new GraphFunctor(
          params.targetFunctor.id,
          params.targetFunctor.sourceGraph,
          params.targetFunctor.targetGraph,
          params.targetFunctor.rules ?? [],
        );
        const eta = new GraphNatTransformation(params.transformId, F, G);
        return eta.verifyNaturality(params.objectA, params.objectB, params.morphism);
      },
      description:
        "Verify that a naturality square commutes for a given morphism between two objects.",
      paramsSchema: {
        type: "object",
        properties: {
          transformId: { type: "string" },
          objectA: { type: "string" },
          objectB: { type: "string" },
          morphism: {
            type: "object",
            properties: {
              op: { type: "string" },
              operand: { type: "number" },
            },
          },
          sourceFunctor: { type: "object" },
          targetFunctor: { type: "object" },
        },
        required: ["transformId", "objectA", "objectB", "morphism", "sourceFunctor", "targetFunctor"],
      },
    },

    composeFunctors: {
      handler: async (params: any) => {
        const { GraphFunctor, composeFunctors } = await import(
          "@/modules/data/knowledge-graph/lib/categorical-engine"
        );
        const F = new GraphFunctor(
          params.F.id, params.F.sourceGraph, params.F.targetGraph, params.F.rules ?? [],
        );
        const G = new GraphFunctor(
          params.G.id, params.G.sourceGraph, params.G.targetGraph, params.G.rules ?? [],
        );
        const composed = composeFunctors(F, G);
        return {
          id: composed.functorId(),
          sourceCategory: composed.sourceCategory(),
          targetCategory: composed.targetCategory(),
          covariant: composed.isCovariant(),
        };
      },
      description: "Compose two functors G∘F into a single functor.",
      paramsSchema: {
        type: "object",
        properties: {
          F: { type: "object" },
          G: { type: "object" },
        },
        required: ["F", "G"],
      },
    },

    constructMonad: {
      handler: async (params: any) => {
        const { GraphFunctor, GraphNatTransformation, GraphMonad } = await import(
          "@/modules/data/knowledge-graph/lib/categorical-engine"
        );
        const T = new GraphFunctor(
          params.T.id, params.T.sourceGraph, params.T.targetGraph, params.T.rules ?? [],
        );
        const idFunctor = new GraphFunctor(
          params.eta?.sourceFunctorId ?? "id", params.T.sourceGraph, params.T.sourceGraph, [],
        );
        const T2 = new GraphFunctor(
          params.mu?.sourceFunctorId ?? "T²", params.T.sourceGraph, params.T.targetGraph,
          [...(params.T.rules ?? []), ...(params.T.rules ?? [])],
        );
        const eta = new GraphNatTransformation(params.etaId ?? "η", idFunctor, T);
        const mu = new GraphNatTransformation(params.muId ?? "μ", T2, T);
        const monad = new GraphMonad(params.id, T, eta, mu);
        return { monadId: monad.monadId(), endofunctor: monad.endofunctor().functorId() };
      },
      description: "Construct a monad (T, η, μ) from an endofunctor and natural transformations.",
      paramsSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          T: { type: "object", description: "Endofunctor config {id, sourceGraph, targetGraph, rules}" },
          etaId: { type: "string" },
          muId: { type: "string" },
        },
        required: ["id", "T"],
      },
    },

    monadBind: {
      handler: async (params: any) => {
        const { GraphFunctor, GraphNatTransformation, GraphMonad } = await import(
          "@/modules/data/knowledge-graph/lib/categorical-engine"
        );
        const T = new GraphFunctor(
          params.T.id, params.T.sourceGraph, params.T.targetGraph, params.T.rules ?? [],
        );
        const idF = new GraphFunctor("id", params.T.sourceGraph, params.T.sourceGraph, []);
        const T2 = new GraphFunctor("T²", params.T.sourceGraph, params.T.targetGraph,
          [...(params.T.rules ?? []), ...(params.T.rules ?? [])]);
        const eta = new GraphNatTransformation(params.etaId ?? "η", idF, T);
        const mu = new GraphNatTransformation(params.muId ?? "μ", T2, T);
        const monad = new GraphMonad(params.monadId, T, eta, mu);
        return monad.bind(params.objectIri, params.kleisliOps ?? []);
      },
      description: "Execute monadic bind: μ ∘ T(f) for a Kleisli arrow.",
      paramsSchema: {
        type: "object",
        properties: {
          monadId: { type: "string" },
          T: { type: "object" },
          objectIri: { type: "string" },
          kleisliOps: { type: "array", items: { type: "object" } },
          etaId: { type: "string" },
          muId: { type: "string" },
        },
        required: ["monadId", "T", "objectIri"],
      },
    },

    verifyMonadLaws: {
      handler: async (params: any) => {
        const { GraphFunctor, GraphNatTransformation, GraphMonad } = await import(
          "@/modules/data/knowledge-graph/lib/categorical-engine"
        );
        const T = new GraphFunctor(
          params.T.id, params.T.sourceGraph, params.T.targetGraph, params.T.rules ?? [],
        );
        const idF = new GraphFunctor("id", params.T.sourceGraph, params.T.sourceGraph, []);
        const T2 = new GraphFunctor("T²", params.T.sourceGraph, params.T.targetGraph,
          [...(params.T.rules ?? []), ...(params.T.rules ?? [])]);
        const eta = new GraphNatTransformation(params.etaId ?? "η", idF, T);
        const mu = new GraphNatTransformation(params.muId ?? "μ", T2, T);
        const monad = new GraphMonad(params.monadId, T, eta, mu);
        return monad.verifyLaws(params.testObjects ?? []);
      },
      description: "Verify the three monad laws (left unit, right unit, associativity).",
      paramsSchema: {
        type: "object",
        properties: {
          monadId: { type: "string" },
          T: { type: "object" },
          testObjects: { type: "array", items: { type: "string" } },
          etaId: { type: "string" },
          muId: { type: "string" },
        },
        required: ["monadId", "T", "testObjects"],
      },
    },

    constructComonad: {
      handler: async (params: any) => {
        const { GraphFunctor, GraphNatTransformation, GraphComonad } = await import(
          "@/modules/data/knowledge-graph/lib/categorical-engine"
        );
        const W = new GraphFunctor(
          params.W.id, params.W.sourceGraph, params.W.targetGraph, params.W.rules ?? [],
        );
        const idF = new GraphFunctor("id", params.W.sourceGraph, params.W.sourceGraph, []);
        const W2 = new GraphFunctor("W²", params.W.sourceGraph, params.W.targetGraph,
          [...(params.W.rules ?? []), ...(params.W.rules ?? [])]);
        const epsilon = new GraphNatTransformation(params.epsilonId ?? "ε", W, idF);
        const delta = new GraphNatTransformation(params.deltaId ?? "δ", W, W2);
        const comonad = new GraphComonad(params.id, W, epsilon, delta);
        return { comonadId: comonad.comonadId(), endofunctor: comonad.endofunctor().functorId() };
      },
      description: "Construct a comonad (W, ε, δ) from an endofunctor and natural transformations.",
      paramsSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          W: { type: "object", description: "Endofunctor config {id, sourceGraph, targetGraph, rules}" },
          epsilonId: { type: "string" },
          deltaId: { type: "string" },
        },
        required: ["id", "W"],
      },
    },

    comonadExtend: {
      handler: async (params: any) => {
        const { GraphFunctor, GraphNatTransformation, GraphComonad } = await import(
          "@/modules/data/knowledge-graph/lib/categorical-engine"
        );
        const W = new GraphFunctor(
          params.W.id, params.W.sourceGraph, params.W.targetGraph, params.W.rules ?? [],
        );
        const idF = new GraphFunctor("id", params.W.sourceGraph, params.W.sourceGraph, []);
        const W2 = new GraphFunctor("W²", params.W.sourceGraph, params.W.targetGraph,
          [...(params.W.rules ?? []), ...(params.W.rules ?? [])]);
        const epsilon = new GraphNatTransformation(params.epsilonId ?? "ε", W, idF);
        const delta = new GraphNatTransformation(params.deltaId ?? "δ", W, W2);
        const comonad = new GraphComonad(params.comonadId, W, epsilon, delta);
        return comonad.extend(params.objectIri, params.coKleisliOps ?? []);
      },
      description: "Execute comonadic extend (cobind): W(f) ∘ δ.",
      paramsSchema: {
        type: "object",
        properties: {
          comonadId: { type: "string" },
          W: { type: "object" },
          objectIri: { type: "string" },
          coKleisliOps: { type: "array", items: { type: "object" } },
          epsilonId: { type: "string" },
          deltaId: { type: "string" },
        },
        required: ["comonadId", "W", "objectIri"],
      },
    },

    comonadExtract: {
      handler: async (params: any) => {
        const { GraphFunctor, GraphNatTransformation, GraphComonad } = await import(
          "@/modules/data/knowledge-graph/lib/categorical-engine"
        );
        const W = new GraphFunctor(
          params.W.id, params.W.sourceGraph, params.W.targetGraph, params.W.rules ?? [],
        );
        const idF = new GraphFunctor("id", params.W.sourceGraph, params.W.sourceGraph, []);
        const W2 = new GraphFunctor("W²", params.W.sourceGraph, params.W.targetGraph,
          [...(params.W.rules ?? []), ...(params.W.rules ?? [])]);
        const epsilon = new GraphNatTransformation(params.epsilonId ?? "ε", W, idF);
        const delta = new GraphNatTransformation(params.deltaId ?? "δ", W, W2);
        const comonad = new GraphComonad(params.comonadId, W, epsilon, delta);
        return comonad.extract(params.objectIri);
      },
      description: "Apply counit ε to extract a value from W(A) → A.",
      paramsSchema: {
        type: "object",
        properties: {
          comonadId: { type: "string" },
          W: { type: "object" },
          objectIri: { type: "string" },
          epsilonId: { type: "string" },
          deltaId: { type: "string" },
        },
        required: ["comonadId", "W", "objectIri"],
      },
    },

    verifyComonadLaws: {
      handler: async (params: any) => {
        const { GraphFunctor, GraphNatTransformation, GraphComonad } = await import(
          "@/modules/data/knowledge-graph/lib/categorical-engine"
        );
        const W = new GraphFunctor(
          params.W.id, params.W.sourceGraph, params.W.targetGraph, params.W.rules ?? [],
        );
        const idF = new GraphFunctor("id", params.W.sourceGraph, params.W.sourceGraph, []);
        const W2 = new GraphFunctor("W²", params.W.sourceGraph, params.W.targetGraph,
          [...(params.W.rules ?? []), ...(params.W.rules ?? [])]);
        const epsilon = new GraphNatTransformation(params.epsilonId ?? "ε", W, idF);
        const delta = new GraphNatTransformation(params.deltaId ?? "δ", W, W2);
        const comonad = new GraphComonad(params.comonadId, W, epsilon, delta);
        return comonad.verifyLaws(params.testObjects ?? []);
      },
      description: "Verify the three comonad laws (left counit, right counit, coassociativity).",
      paramsSchema: {
        type: "object",
        properties: {
          comonadId: { type: "string" },
          W: { type: "object" },
          testObjects: { type: "array", items: { type: "string" } },
          epsilonId: { type: "string" },
          deltaId: { type: "string" },
        },
        required: ["comonadId", "W", "testObjects"],
      },
    },
  },
});
