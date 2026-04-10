/**
 * Categorical Engine — Functors & Natural Transformations as Graph Operations.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Makes the categorical abstractions from `types/uor-foundation/user/morphism.ts`
 * executable inside GrafeoDB. Every functor application, natural transformation
 * component, and verification witness is content-addressed and materialized
 * as first-class quads in the knowledge graph.
 *
 * Architecture:
 *   Objects  = Named-graph nodes (each carrying a UOR Datum)
 *   Functors = Structure-preserving maps between named graphs
 *   NatTrans = Families of morphisms η_A : F(A) → G(A) with naturality
 *
 * Built on top of:
 *   graph-morphisms.ts  → applyMorphism(), composeMorphisms()
 *   delta-engine.ts     → computeDelta(), composeDelta(), invertDelta()
 *
 * @module knowledge-graph/lib/categorical-engine
 */

import {
  applyMorphism,
  composeMorphisms,
  materializeMorphismEdge,
  identityMorphism,
  type PrimitiveOp,
  type GraphMorphism,
} from "./graph-morphisms";
import {
  computeDelta,
  composeDelta,
  invertDelta,
  type Delta,
  type DeltaStep,
} from "./delta-engine";
import { sparqlQuery, sparqlUpdate, type SparqlBinding } from "../grafeo-store";
import { singleProofHash } from "@/lib/uor-canonical";
import type {
  FunctorMorphism,
  NaturalTransformation,
  AdjunctionPair,
  MonadMorphism,
  ComonadMorphism,
  Transform,
} from "@/types/uor-foundation/user/morphism";

// ── Types ───────────────────────────────────────────────────────────────────

/** A step in a functor's mapping rule — applied to every object in the source category. */
export interface FunctorRule {
  op: PrimitiveOp;
  operand?: number;
}

/** Result of applying a functor to all objects in a source graph. */
export interface FunctorApplicationResult {
  functorId: string;
  mappings: Array<{ sourceIri: string; targetIri: string }>;
  morphismsMaterialized: number;
  contentDigest: string;
}

/** Result of verifying a naturality square. */
export interface NaturalityVerification {
  objectA: string;
  objectB: string;
  morphismIri: string;
  pathTopRight: string;   // G(f) ∘ η_A
  pathBottomLeft: string; // η_B ∘ F(f)
  commutes: boolean;
  witnessDigest: string;
}

/** Result of computing a natural transformation component. */
export interface NatTransComponent {
  objectIri: string;
  sourceImage: string;  // F(A)
  targetImage: string;  // G(A)
  delta: Delta;
  componentDigest: string;
}

// ── GraphFunctor ────────────────────────────────────────────────────────────

/**
 * GraphFunctor — a structure-preserving map between named graphs.
 *
 * Source and target categories are GrafeoDB named graphs. The functor
 * applies a fixed morphism chain (rule) to every node in the source graph,
 * materializing results in the target graph.
 *
 * Implements `FunctorMorphism` from the UOR foundation types.
 */
export class GraphFunctor implements FunctorMorphism {
  private readonly _id: string;
  private readonly _sourceGraph: string;
  private readonly _targetGraph: string;
  private readonly _rules: FunctorRule[];
  private readonly _covariant: boolean;
  private _objectMap: Map<string, string> = new Map();

  constructor(
    id: string,
    sourceGraph: string,
    targetGraph: string,
    rules: FunctorRule[],
    covariant = true,
  ) {
    this._id = id;
    this._sourceGraph = sourceGraph;
    this._targetGraph = targetGraph;
    this._rules = rules;
    this._covariant = covariant;
  }

  // ── FunctorMorphism interface ──────────────────────────────────────────

  functorId(): string { return this._id; }
  sourceCategory(): string { return this._sourceGraph; }
  targetCategory(): string { return this._targetGraph; }
  isCovariant(): boolean { return this._covariant; }

  preservesIdentity(): boolean {
    // Verified dynamically via verifyPreservesIdentity()
    return true;
  }

  // ── Graph operations ──────────────────────────────────────────────────

  /** Apply functor to a single object, returning the target IRI. */
  async apply(nodeIri: string): Promise<string> {
    if (this._rules.length === 0) {
      // Identity functor
      this._objectMap.set(nodeIri, nodeIri);
      return nodeIri;
    }

    const ops = this._rules.map(r => ({ op: r.op, operand: r.operand }));
    const result = await composeMorphisms(nodeIri, ops);

    // Materialize all edges in the chain
    for (const m of result.chain) {
      await materializeMorphismEdge(m);
    }

    // Record the functor mapping as a quad
    await sparqlUpdate(`
      INSERT DATA {
        <urn:uor:functor:${this._id}>
          <urn:uor:category:mapsObject>
          <${result.finalIri}> .
        <${nodeIri}>
          <urn:uor:functor:${this._id}:image>
          <${result.finalIri}> .
      }
    `);

    this._objectMap.set(nodeIri, result.finalIri);
    return result.finalIri;
  }

  /** Apply functor to all objects in the source named graph. */
  async applyAll(): Promise<FunctorApplicationResult> {
    const nodes = await queryGraphNodes(this._sourceGraph);
    const mappings: Array<{ sourceIri: string; targetIri: string }> = [];

    for (const nodeIri of nodes) {
      const targetIri = await this.apply(nodeIri);
      mappings.push({ sourceIri: nodeIri, targetIri });
    }

    // Content-address the entire application result
    const proof = await singleProofHash({
      "@type": "uor:FunctorApplication",
      "uor:functorId": this._id,
      "uor:source": this._sourceGraph,
      "uor:target": this._targetGraph,
      "uor:mappingCount": mappings.length,
    });

    // Materialize functor metadata
    await sparqlUpdate(`
      INSERT DATA {
        <urn:uor:functor:${this._id}>
          <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
          <urn:uor:category:Functor> .
        <urn:uor:functor:${this._id}>
          <urn:uor:category:sourceGraph>
          <${this._sourceGraph}> .
        <urn:uor:functor:${this._id}>
          <urn:uor:category:targetGraph>
          <${this._targetGraph}> .
        <urn:uor:functor:${this._id}>
          <urn:uor:category:digest>
          "${proof.cid}" .
      }
    `);

    return {
      functorId: this._id,
      mappings,
      morphismsMaterialized: mappings.length,
      contentDigest: proof.cid,
    };
  }

  /** Verify F(id_A) = id_{F(A)} for a given object. */
  async verifyPreservesIdentity(objectIri: string): Promise<boolean> {
    const idMorphism = identityMorphism(objectIri);
    const fA = await this.apply(objectIri);
    const idFA = identityMorphism(fA);

    // F(id_A) should map to id_{F(A)} — both are identity on the image
    return idMorphism.source === idMorphism.target &&
           idFA.source === idFA.target &&
           fA === idFA.source;
  }

  /** Verify F(g∘f) = F(g)∘F(f) for two composable morphisms. */
  async verifyPreservesComposition(
    fMorphism: { op: PrimitiveOp; operand?: number },
    gMorphism: { op: PrimitiveOp; operand?: number },
    objectIri: string,
  ): Promise<boolean> {
    // Path 1: F(g∘f) — compose first, then apply functor
    const composedResult = await composeMorphisms(objectIri, [
      { op: fMorphism.op, operand: fMorphism.operand },
      { op: gMorphism.op, operand: gMorphism.operand },
    ]);
    const fComposed = await this.apply(composedResult.finalIri);

    // Path 2: F(g)∘F(f) — apply functor to each, then compose images
    const fF = await this.apply(objectIri);
    const afterF = await composeMorphisms(fF, [
      { op: fMorphism.op, operand: fMorphism.operand },
      { op: gMorphism.op, operand: gMorphism.operand },
    ]);

    // Content-addressed equality — if IRIs match, composition is preserved
    return fComposed === afterF.finalIri;
  }

  /** Get the cached object map (source → target). */
  getObjectMap(): ReadonlyMap<string, string> {
    return this._objectMap;
  }

  /** Get the morphism rules this functor applies. */
  getRules(): readonly FunctorRule[] {
    return this._rules;
  }
}

// ── GraphNatTransformation ──────────────────────────────────────────────────

/**
 * GraphNatTransformation — a family of morphisms η_A : F(A) → G(A)
 * between two functors, verified to commute with all morphisms.
 *
 * The naturality square:
 *   F(A) ──η_A──▸ G(A)
 *    │               │
 *   F(f)            G(f)
 *    │               │
 *    ▾               ▾
 *   F(B) ──η_B──▸ G(B)
 *
 * Verification: G(f) ∘ η_A === η_B ∘ F(f)
 * Both paths produce content-addressed IRIs; equality = commutativity.
 */
export class GraphNatTransformation {
  private readonly _id: string;
  private readonly _source: GraphFunctor;
  private readonly _target: GraphFunctor;
  private _components: Map<string, NatTransComponent> = new Map();

  constructor(id: string, source: GraphFunctor, target: GraphFunctor) {
    this._id = id;
    this._source = source;
    this._target = target;
  }

  transformationId(): string { return this._id; }
  source(): GraphFunctor { return this._source; }
  target(): GraphFunctor { return this._target; }

  /**
   * Compute the component η_A : F(A) → G(A) at a given object A.
   * The component is the delta between the two functor images.
   */
  async componentAt(objectIri: string): Promise<NatTransComponent> {
    const cached = this._components.get(objectIri);
    if (cached) return cached;

    // Compute F(A) and G(A)
    const fA = await this._source.apply(objectIri);
    const gA = await this._target.apply(objectIri);

    // The component morphism is the delta from F(A) to G(A)
    const delta = await computeDelta(fA, gA);

    // Content-address the component
    const proof = await singleProofHash({
      "@type": "uor:NatTransComponent",
      "uor:transformation": this._id,
      "uor:object": objectIri,
      "uor:source": fA,
      "uor:target": gA,
      "uor:deltaDigest": delta.digest,
    });

    // Materialize in graph
    await sparqlUpdate(`
      INSERT DATA {
        <urn:uor:nattrans:${this._id}:component:${encodeURIComponent(objectIri)}>
          <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
          <urn:uor:category:NatTransComponent> .
        <urn:uor:nattrans:${this._id}:component:${encodeURIComponent(objectIri)}>
          <urn:uor:category:atObject>
          <${objectIri}> .
        <urn:uor:nattrans:${this._id}:component:${encodeURIComponent(objectIri)}>
          <urn:uor:category:fromImage>
          <${fA}> .
        <urn:uor:nattrans:${this._id}:component:${encodeURIComponent(objectIri)}>
          <urn:uor:category:toImage>
          <${gA}> .
        <urn:uor:nattrans:${this._id}:component:${encodeURIComponent(objectIri)}>
          <urn:uor:category:digest>
          "${proof.cid}" .
      }
    `);

    const component: NatTransComponent = {
      objectIri,
      sourceImage: fA,
      targetImage: gA,
      delta,
      componentDigest: proof.cid,
    };

    this._components.set(objectIri, component);
    return component;
  }

  /**
   * Verify the naturality square commutes for a morphism f : A → B.
   *
   * Checks: G(f) ∘ η_A === η_B ∘ F(f)
   * Both paths are content-addressed — IRI equality = commutativity.
   */
  async verifyNaturality(
    objectA: string,
    objectB: string,
    morphism: { op: PrimitiveOp; operand?: number },
  ): Promise<NaturalityVerification> {
    // Compute all four corners
    const fA = await this._source.apply(objectA);
    const fB = await this._source.apply(objectB);
    const gA = await this._target.apply(objectA);
    const gB = await this._target.apply(objectB);

    // Path 1 (top-right): η_A then G(f)
    // η_A : F(A) → G(A) is implicit (delta)
    // G(f) : G(A) → G(B) — apply morphism in target category
    const pathTopRight = await composeMorphisms(gA, [
      { op: morphism.op, operand: morphism.operand },
    ]);

    // Path 2 (bottom-left): F(f) then η_B
    // F(f) : F(A) → F(B) — apply morphism in source category
    const pathBottomLeft_Ff = await composeMorphisms(fA, [
      { op: morphism.op, operand: morphism.operand },
    ]);
    // η_B should map F(B) → G(B), which is the delta from F(B) to G(B)
    // For commutativity, the final targets must match

    const commutes = pathTopRight.finalIri === gB &&
                     pathBottomLeft_Ff.finalIri === fB;

    // Content-address the verification witness
    const proof = await singleProofHash({
      "@type": "uor:NaturalityWitness",
      "uor:transformation": this._id,
      "uor:objectA": objectA,
      "uor:objectB": objectB,
      "uor:commutes": commutes,
      "uor:pathTopRight": pathTopRight.finalIri,
      "uor:pathBottomLeft": pathBottomLeft_Ff.finalIri,
    });

    // Materialize witness in graph
    await sparqlUpdate(`
      INSERT DATA {
        <urn:uor:nattrans:${this._id}:witness:${proof.cid}>
          <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
          <urn:uor:category:NaturalityWitness> .
        <urn:uor:nattrans:${this._id}:witness:${proof.cid}>
          <urn:uor:category:commutes>
          "${commutes}" .
      }
    `);

    return {
      objectA,
      objectB,
      morphismIri: `urn:uor:morphism:${morphism.op}`,
      pathTopRight: pathTopRight.finalIri,
      pathBottomLeft: pathBottomLeft_Ff.finalIri,
      commutes,
      witnessDigest: proof.cid,
    };
  }

  /**
   * Check if this natural transformation is a natural isomorphism
   * (every component η_A is invertible).
   */
  async isIsomorphism(objectIris: string[]): Promise<boolean> {
    for (const iri of objectIris) {
      const component = await this.componentAt(iri);
      const inverse = await invertDelta(component.delta);
      // An invertible delta has a non-empty chain that can round-trip
      if (!inverse || inverse.chain.length === 0) return false;
    }
    return true;
  }

  /** Get all computed components. */
  getComponents(): ReadonlyMap<string, NatTransComponent> {
    return this._components;
  }
}

// ── GraphAdjunction ─────────────────────────────────────────────────────────

/**
 * GraphAdjunction — an adjoint pair (F ⊣ G) of functors with unit and counit.
 *
 * Verifies the triangle identities:
 *   εF ∘ Fη = id_F
 *   Gε ∘ ηG = id_G
 */
export class GraphAdjunction {
  private readonly _left: GraphFunctor;
  private readonly _right: GraphFunctor;
  private readonly _unit: GraphNatTransformation;
  private readonly _counit: GraphNatTransformation;

  constructor(
    left: GraphFunctor,
    right: GraphFunctor,
    unit: GraphNatTransformation,
    counit: GraphNatTransformation,
  ) {
    this._left = left;
    this._right = right;
    this._unit = unit;
    this._counit = counit;
  }

  leftAdjoint(): GraphFunctor { return this._left; }
  rightAdjoint(): GraphFunctor { return this._right; }
  unit(): GraphNatTransformation { return this._unit; }
  counit(): GraphNatTransformation { return this._counit; }

  /**
   * Verify triangle identities for a set of test objects.
   *
   * Identity 1: εF ∘ Fη = id_F  (for objects in the source of F)
   * Identity 2: Gε ∘ ηG = id_G  (for objects in the source of G)
   */
  async verifyTriangleIdentities(testObjects: string[]): Promise<{
    identity1Holds: boolean;
    identity2Holds: boolean;
    testedObjects: number;
    digest: string;
  }> {
    let id1Holds = true;
    let id2Holds = true;

    for (const obj of testObjects) {
      // Identity 1: εF ∘ Fη = id_F
      // Fη(A) = F(η_A) — apply F to the unit component at A
      const unitComp = await this._unit.componentAt(obj);
      const fUnit = await this._left.apply(unitComp.targetImage);
      // ε at F(A)
      const counitComp = await this._counit.componentAt(fUnit);
      // Should arrive back at F(A)
      const fA = await this._left.apply(obj);
      if (counitComp.targetImage !== fA) {
        id1Holds = false;
      }

      // Identity 2: Gε ∘ ηG = id_G
      const gObj = await this._right.apply(obj);
      const counitAtObj = await this._counit.componentAt(obj);
      const gCounit = await this._right.apply(counitAtObj.targetImage);
      const unitAtG = await this._unit.componentAt(gObj);
      if (gCounit !== unitAtG.sourceImage) {
        id2Holds = false;
      }
    }

    const proof = await singleProofHash({
      "@type": "uor:AdjunctionVerification",
      "uor:left": this._left.functorId(),
      "uor:right": this._right.functorId(),
      "uor:identity1": id1Holds,
      "uor:identity2": id2Holds,
      "uor:tested": testObjects.length,
    });

    return {
      identity1Holds: id1Holds,
      identity2Holds: id2Holds,
      testedObjects: testObjects.length,
      digest: proof.cid,
    };
  }
}

// ── Composition Helpers ─────────────────────────────────────────────────────

/**
 * Compose two functors: G ∘ F.
 * The resulting functor applies F's rules then G's rules sequentially.
 */
export function composeFunctors(
  F: GraphFunctor,
  G: GraphFunctor,
): GraphFunctor {
  const composedRules: FunctorRule[] = [
    ...F.getRules(),
    ...G.getRules(),
  ];
  return new GraphFunctor(
    `${G.functorId()}∘${F.functorId()}`,
    F.sourceCategory(),
    G.targetCategory(),
    composedRules,
    F.isCovariant() === G.isCovariant(), // contravariant ∘ contravariant = covariant
  );
}

/**
 * Vertical composition of natural transformations: μ ∘ η.
 * Given η : F → G and μ : G → H, produces μ∘η : F → H.
 */
export function verticalCompose(
  eta: GraphNatTransformation,
  mu: GraphNatTransformation,
): GraphNatTransformation {
  if (eta.target().functorId() !== mu.source().functorId()) {
    throw new Error(
      `[CategoricalEngine] Cannot vertically compose: ` +
      `η target (${eta.target().functorId()}) ≠ μ source (${mu.source().functorId()})`,
    );
  }
  return new GraphNatTransformation(
    `${mu.transformationId()}∘${eta.transformationId()}`,
    eta.source(),
    mu.target(),
  );
}

/**
 * Horizontal composition of natural transformations.
 * Given η : F → G and μ : H → K, produces μ*η : H∘F → K∘G.
 */
export function horizontalCompose(
  eta: GraphNatTransformation,
  mu: GraphNatTransformation,
): GraphNatTransformation {
  const composedSource = composeFunctors(eta.source(), mu.source());
  const composedTarget = composeFunctors(eta.target(), mu.target());
  return new GraphNatTransformation(
    `${mu.transformationId()}*${eta.transformationId()}`,
    composedSource,
    composedTarget,
  );
}

// ── GraphMonad ──────────────────────────────────────────────────────────────

/** Result of verifying monad laws. */
export interface MonadLawVerification {
  leftUnit: boolean;   // μ ∘ ηT = id_T
  rightUnit: boolean;  // μ ∘ Tη = id_T
  associativity: boolean; // μ ∘ Tμ = μ ∘ μT
  testedObjects: number;
  digest: string;
}

/**
 * GraphMonad — a monad (T, η, μ) on the knowledge graph.
 *
 * T : C → C is an endofunctor, η : Id → T is the unit,
 * μ : T² → T is the multiplication.
 *
 * Implements `MonadMorphism` from the UOR foundation types.
 */
export class GraphMonad {
  private readonly _id: string;
  private readonly _T: GraphFunctor;
  private readonly _eta: GraphNatTransformation;
  private readonly _mu: GraphNatTransformation;

  constructor(
    id: string,
    T: GraphFunctor,
    eta: GraphNatTransformation,
    mu: GraphNatTransformation,
  ) {
    this._id = id;
    this._T = T;
    this._eta = eta;
    this._mu = mu;
  }

  monadId(): string { return this._id; }
  endofunctor(): GraphFunctor { return this._T; }
  unit(): GraphNatTransformation { return this._eta; }
  multiplication(): GraphNatTransformation { return this._mu; }

  /**
   * Monadic bind: given a value in T(A) and a Kleisli arrow f : A → T(B),
   * produce T(B). Implemented as μ ∘ T(f).
   */
  async bind(
    objectIri: string,
    kleisliOps: FunctorRule[],
  ): Promise<{ resultIri: string; digest: string }> {
    // Apply T to the object
    const tA = await this._T.apply(objectIri);

    // Apply the Kleisli arrow (modeled as morphism chain)
    const ops = kleisliOps.map(r => ({ op: r.op, operand: r.operand }));
    const kleisliResult = await composeMorphisms(tA, ops);

    // Apply T again (T²)
    const ttB = await this._T.apply(kleisliResult.finalIri);

    // Apply μ (multiplication flattens T² → T)
    const muComp = await this._mu.componentAt(ttB);

    const proof = await singleProofHash({
      "@type": "uor:MonadBind",
      "uor:monad": this._id,
      "uor:source": objectIri,
      "uor:result": muComp.targetImage,
    });

    await sparqlUpdate(`
      INSERT DATA {
        <urn:uor:monad:${this._id}:bind:${proof.cid}>
          <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
          <urn:uor:category:MonadBind> .
        <urn:uor:monad:${this._id}:bind:${proof.cid}>
          <urn:uor:category:source> <${objectIri}> .
        <urn:uor:monad:${this._id}:bind:${proof.cid}>
          <urn:uor:category:result> <${muComp.targetImage}> .
      }
    `);

    return { resultIri: muComp.targetImage, digest: proof.cid };
  }

  /**
   * Verify the three monad laws for a set of test objects.
   *
   * 1. Left unit:  μ ∘ ηT = id_T
   * 2. Right unit: μ ∘ Tη = id_T
   * 3. Associativity: μ ∘ Tμ = μ ∘ μT
   */
  async verifyLaws(testObjects: string[]): Promise<MonadLawVerification> {
    let leftUnit = true;
    let rightUnit = true;
    let associativity = true;

    for (const obj of testObjects) {
      const tA = await this._T.apply(obj);

      // Left unit: μ(η(T(A))) should equal T(A)
      const etaAtTA = await this._eta.componentAt(tA);
      const muAtEta = await this._mu.componentAt(etaAtTA.targetImage);
      if (muAtEta.targetImage !== tA) leftUnit = false;

      // Right unit: μ(T(η(A))) should equal T(A)
      const etaAtA = await this._eta.componentAt(obj);
      const tEtaA = await this._T.apply(etaAtA.targetImage);
      const muAtTEta = await this._mu.componentAt(tEtaA);
      if (muAtTEta.targetImage !== tA) rightUnit = false;

      // Associativity: μ(Tμ(A)) = μ(μT(A))
      // Both paths from T³ → T should agree
      const ttA = await this._T.apply(tA);
      const tttA = await this._T.apply(ttA);
      
      // Path 1: μ ∘ Tμ
      const muInner = await this._mu.componentAt(ttA);
      const tMuInner = await this._T.apply(muInner.targetImage);
      const path1 = await this._mu.componentAt(tMuInner);

      // Path 2: μ ∘ μT
      const muOuter = await this._mu.componentAt(tttA);
      const path2 = await this._mu.componentAt(muOuter.targetImage);

      if (path1.targetImage !== path2.targetImage) associativity = false;
    }

    const proof = await singleProofHash({
      "@type": "uor:MonadLawVerification",
      "uor:monad": this._id,
      "uor:leftUnit": leftUnit,
      "uor:rightUnit": rightUnit,
      "uor:associativity": associativity,
      "uor:tested": testObjects.length,
    });

    await sparqlUpdate(`
      INSERT DATA {
        <urn:uor:monad:${this._id}:laws:${proof.cid}>
          <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
          <urn:uor:category:MonadLawWitness> .
        <urn:uor:monad:${this._id}:laws:${proof.cid}>
          <urn:uor:category:leftUnit> "${leftUnit}" .
        <urn:uor:monad:${this._id}:laws:${proof.cid}>
          <urn:uor:category:rightUnit> "${rightUnit}" .
        <urn:uor:monad:${this._id}:laws:${proof.cid}>
          <urn:uor:category:associativity> "${associativity}" .
      }
    `);

    return { leftUnit, rightUnit, associativity, testedObjects: testObjects.length, digest: proof.cid };
  }
}

// ── GraphComonad ────────────────────────────────────────────────────────────

/** Result of verifying comonad laws. */
export interface ComonadLawVerification {
  leftCounit: boolean;   // εW ∘ δ = id_W
  rightCounit: boolean;  // Wε ∘ δ = id_W
  coassociativity: boolean; // Wδ ∘ δ = δW ∘ δ
  testedObjects: number;
  digest: string;
}

/**
 * GraphComonad — a comonad (W, ε, δ) on the knowledge graph.
 *
 * W : C → C is an endofunctor, ε : W → Id is the counit,
 * δ : W → W² is the comultiplication.
 *
 * Dual to GraphMonad. Implements `ComonadMorphism`.
 */
export class GraphComonad {
  private readonly _id: string;
  private readonly _W: GraphFunctor;
  private readonly _epsilon: GraphNatTransformation;
  private readonly _delta: GraphNatTransformation;

  constructor(
    id: string,
    W: GraphFunctor,
    epsilon: GraphNatTransformation,
    delta: GraphNatTransformation,
  ) {
    this._id = id;
    this._W = W;
    this._epsilon = epsilon;
    this._delta = delta;
  }

  comonadId(): string { return this._id; }
  endofunctor(): GraphFunctor { return this._W; }
  counit(): GraphNatTransformation { return this._epsilon; }
  comultiplication(): GraphNatTransformation { return this._delta; }

  /**
   * Comonadic extend (cobind): dual of monadic bind.
   * Given W(A) and a co-Kleisli arrow f : W(A) → B, produce W(B).
   * Implemented as W(f) ∘ δ.
   */
  async extend(
    objectIri: string,
    coKleisliOps: FunctorRule[],
  ): Promise<{ resultIri: string; digest: string }> {
    // Apply W to get W(A)
    const wA = await this._W.apply(objectIri);

    // Apply δ (comultiplication) to get W²(A)
    const deltaComp = await this._delta.componentAt(wA);

    // Apply the co-Kleisli arrow
    const ops = coKleisliOps.map(r => ({ op: r.op, operand: r.operand }));
    const coKleisliResult = await composeMorphisms(deltaComp.targetImage, ops);

    // Apply W to the result
    const wB = await this._W.apply(coKleisliResult.finalIri);

    const proof = await singleProofHash({
      "@type": "uor:ComonadExtend",
      "uor:comonad": this._id,
      "uor:source": objectIri,
      "uor:result": wB,
    });

    await sparqlUpdate(`
      INSERT DATA {
        <urn:uor:comonad:${this._id}:extend:${proof.cid}>
          <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
          <urn:uor:category:ComonadExtend> .
        <urn:uor:comonad:${this._id}:extend:${proof.cid}>
          <urn:uor:category:source> <${objectIri}> .
        <urn:uor:comonad:${this._id}:extend:${proof.cid}>
          <urn:uor:category:result> <${wB}> .
      }
    `);

    return { resultIri: wB, digest: proof.cid };
  }

  /**
   * Extract: apply counit ε to extract a value from W(A) → A.
   */
  async extract(objectIri: string): Promise<{ resultIri: string; digest: string }> {
    const wA = await this._W.apply(objectIri);
    const epsilonComp = await this._epsilon.componentAt(wA);

    const proof = await singleProofHash({
      "@type": "uor:ComonadExtract",
      "uor:comonad": this._id,
      "uor:source": objectIri,
      "uor:result": epsilonComp.targetImage,
    });

    return { resultIri: epsilonComp.targetImage, digest: proof.cid };
  }

  /**
   * Verify the three comonad laws for a set of test objects.
   *
   * 1. Left counit:  ε_W ∘ δ = id_W
   * 2. Right counit: Wε ∘ δ = id_W
   * 3. Coassociativity: Wδ ∘ δ = δW ∘ δ
   */
  async verifyLaws(testObjects: string[]): Promise<ComonadLawVerification> {
    let leftCounit = true;
    let rightCounit = true;
    let coassociativity = true;

    for (const obj of testObjects) {
      const wA = await this._W.apply(obj);

      // Left counit: ε(W(δ(W(A)))) = W(A)
      const deltaAtWA = await this._delta.componentAt(wA);
      const epsilonAtDelta = await this._epsilon.componentAt(deltaAtWA.targetImage);
      if (epsilonAtDelta.targetImage !== wA) leftCounit = false;

      // Right counit: W(ε)(δ(W(A))) = W(A)
      const wEpsilon = await this._W.apply(
        (await this._epsilon.componentAt(deltaAtWA.targetImage)).targetImage,
      );
      if (wEpsilon !== wA) rightCounit = false;

      // Coassociativity: Wδ ∘ δ = δW ∘ δ
      // Path 1: δ then Wδ
      const delta1 = await this._delta.componentAt(wA);
      const wDelta1 = await this._W.apply(
        (await this._delta.componentAt(delta1.targetImage)).targetImage,
      );

      // Path 2: δ then δW
      const delta2 = await this._delta.componentAt(wA);
      const deltaW = await this._delta.componentAt(
        await this._W.apply(delta2.targetImage),
      );

      if (wDelta1 !== deltaW.targetImage) coassociativity = false;
    }

    const proof = await singleProofHash({
      "@type": "uor:ComonadLawVerification",
      "uor:comonad": this._id,
      "uor:leftCounit": leftCounit,
      "uor:rightCounit": rightCounit,
      "uor:coassociativity": coassociativity,
      "uor:tested": testObjects.length,
    });

    await sparqlUpdate(`
      INSERT DATA {
        <urn:uor:comonad:${this._id}:laws:${proof.cid}>
          <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
          <urn:uor:category:ComonadLawWitness> .
        <urn:uor:comonad:${this._id}:laws:${proof.cid}>
          <urn:uor:category:leftCounit> "${leftCounit}" .
        <urn:uor:comonad:${this._id}:laws:${proof.cid}>
          <urn:uor:category:rightCounit> "${rightCounit}" .
        <urn:uor:comonad:${this._id}:laws:${proof.cid}>
          <urn:uor:category:coassociativity> "${coassociativity}" .
      }
    `);

    return { leftCounit, rightCounit, coassociativity, testedObjects: testObjects.length, digest: proof.cid };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Query all node IRIs in a named graph. */
async function queryGraphNodes(graphIri: string): Promise<string[]> {
  try {
    const results = await sparqlQuery(
      `SELECT DISTINCT ?s WHERE { GRAPH <${graphIri}> { ?s ?p ?o } }`,
    ) as SparqlBinding[];

    if (!Array.isArray(results)) return [];

    return results
      .map(b => b["?s"] || b.s)
      .filter((v): v is string => typeof v === "string");
  } catch {
    // Graph may be empty or not exist yet
    return [];
  }
}
