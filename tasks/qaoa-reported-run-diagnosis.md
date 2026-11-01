# QAOA diagnosis for the supplied OSRM request

Date: 1 November 2026. Scope: diagnosis and controlled replay; solver behavior has
not been changed by this investigation.

## Reproduction

The attached JSON response was parsed directly. The supplied scenario was replayed
against the running local API with OSRM, all hospital capabilities enabled,
p=1, 30 evaluations, 1024 shots and seed 42. It reproduced the supplied objectives:

- Full exact objective: 70.25208333333333; all three incidents served.
- Reduced exact objective: 170.59721666666667.
- Raw QAOA objective: 481.9534833333333; only I1 served, by A1 to H2.
- Quantum status completed and plan_valid true; this means simulation completed
  and the selected sample respects constraints, not that every incident is served.
- Initial selected solver exact: the API's top-level complete plan is Classical.

## Cause 1: independent cheapest-choice pruning destroys full service feasibility

The full model contains 24 choices, including explicit unserved choices. The
12-qubit retained model keeps three served choices plus unserved per incident.
For I1, all three served choices use A1. For I3, all three use H2. Serving I3
therefore occupies H2, while the only retained non-H2 option for I2 uses A1,
which I1 already needs. All three cannot be served simultaneously in the
retained model, even though the full exact model can do so.

Enumeration of all 4096 bitstrings finds only 18 valid schedules. Their maximum
served count is two. The reduced exact optimum is I1/A1/H1, I2/A2/H2 and I3
unserved. This is a model-reduction limitation before QAOA optimization starts;
more layers, evaluations or shots cannot recover removed choices.

## Cause 2: low valid-sample probability and a limited optimizer

The reported QAOA final state has valid probability 0.004331271806953234
(0.4331%). Reconstructing the circuit from the attached QUBO and final parameters,
then reproducing the seeded multinomial sampling, yields exactly four valid shots:
three one-incident schedules and one all-unserved schedule. The best sampled
schedule costs 481.9534833333333. The reduced optimum was not sampled.

The final-state probability of the reduced optimum is about 0.00023944, or
0.02394%. The initial Hadamard state spans every bitstring, while the X mixer
does not preserve incident one-hot constraints. The penalty energy is correct,
but this shallow variational circuit/optimizer has concentrated little probability
on valid schedules. COBYLA reports exhausting its 30-evaluation MAXFUN budget.

For independent samples from this particular final distribution, 1024 shots have
about 1.17% probability of containing no valid sample and 1.51% probability of
containing no valid sample that serves any incident. These probabilities describe
fresh draws; fixed seed 42 makes a fixed input reproducible rather than random
across repeated requests.

## Controlled experiments on the same retained QUBO

- p=1, evaluations=30, shots=8192, seed=42: two served, cost
  170.59721666666667. More samples found the reduced optimum, not the full optimum.
- p=1, evaluations=100, shots=1024, seed=42: one served, cost
  481.9534833333333; valid probability about 0.4316%. More evaluations alone
  did not solve this case.
- p=2, evaluations=100, shots=1024, seed=42: no valid sampled schedule;
  assignments/objective null and valid probability about 0.0219%. This reproduces
  an empty-QAOA-output case. More layers are not guaranteed to improve a run.

An all-unserved schedule is distinct from no valid sampled schedule: the former
is an allowed plan with three explicit unserved choices, while the latter has
no QAOA plan to display. Both can produce no dispatch connectors in the UI.

## Route interpretation and next engineering changes

OSRM produces and scores route legs before allocation. Classical and QAOA select
from those shared ambulance/incident/hospital choices; they do not independently
search road geometry. Matching assignments therefore share route geometry.
Different assignments can also share an ambulance-to-incident leg.

The first engineering change is resource-aware candidate retention so the reduced
model does not unnecessarily remove complete feasible allocations. The next is
improving valid-state probability and optimizer robustness, with repeated-seed
benchmarks. Genuine raw quantum output must remain separate from Classical
fallback or any future repair/postprocessing. A better observed sample is not a
guarantee of quantum advantage or universal optimality.

Relevant implementation: `backend/allocation/qubo.py` (pruning/penalties),
`backend/allocation/qaoa.py` (circuit/optimization/sampling),
`backend/allocation/service.py` (validation/fallback) and
`backend/allocation/travel.py` (shared route generation).

Local replay and compact numerical diagnostics were saved under ignored
`frontend/test-results/qaoa-reported-*` files.
