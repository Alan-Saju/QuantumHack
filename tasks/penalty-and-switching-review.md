# Penalty and solver-view verification

Date: 1 November 2026.

## Reproducing the reported switching symptom

A fresh browser session against the running app, with the default 30 evaluations,
returned Classical cost 50.2488368263 and QAOA cost 99.0275526449. Switching
Classical -> QAOA -> Classical changed the displayed costs 50.25 -> 99.03 ->
50.25, the assignments, and the rendered leg counts 6 -> 4 -> 6. Only one
optimization request was made, and no browser page errors occurred. The reported
unchanged-cost/unchanged-map symptom was not reproduced in that session.

Two user-visible gaps were confirmed: identical plans had no explicit explanation
for unchanged geography/cost, and unversioned static assets had no Cache-Control
revalidation policy. The UI now states when plans are identical or differ, labels
the map with the active solver, and static assets revalidate on reload. These
improvements do not establish that caching caused the user's particular session.

Regression checks cover different assignments, worse-but-valid QAOA, identical
assignments, unavailable QAOA, repeated switching, trip views, changing the
scenario, and switching while the Scenario panel is collapsed. Collapsing and
expanding must preserve both inputs and the run without new optimization calls.

## Penalty mathematics

Let S be the sum over incidents of the maximum compatible served-choice cost,
using zero when there is no served choice. M = 1 + S. An unserved incident costs
severity*M. Because severity is integer-valued, changing unserved total severity
by one outweighs every possible difference in the served-cost sum. This is the
model's configured priority, not a clinical triage standard or a guarantee to
maximize the number of incidents served regardless of severity.

Let B be the sum over retained incident groups of their maximum choice cost,
including unserved. P = 1 + B. The QUBO energy is exactly:

    selected_choice_cost
    + P * sum_incidents(selected_count - 1)^2
    + P * count_conflicting_pairs_across_incidents

A conflicting pair shares an ambulance OR a hospital slot. Each such pair gets
one P even if it shares both; one is sufficient for the bound. All choice costs
are nonnegative. Any invalid bitstring therefore has energy at least P, while
the valid all-unserved plan costs at most B. Invalid energy exceeds that valid
plan. For valid bitstrings, energy equals the selected allocation objective.

`tests/test_penalty_contract.py` independently reconstructs this expression for
every bitstring in normal, scarce-resource and unavailable-resource scenarios.
It verifies the M/P bounds and agreement with exact enumeration. Existing tests
also verify QUBO-to-Ising energies, real Qiskit execution, independent sample
validation and Classical/QAOA cost parity for road-aware allocation.

## Road preferences and limitations

The shared default road cost is T + 0.5*N + 0.3*S + 0.2*U, in seconds-equivalent.
Tests verify the numeric formula, exposure weighting, segment-splitting invariance,
optional traffic counted once, disabled preference handling, missing-data treatment
and hard restrictions independent of scoring options. ETA stays separate from cost.
Both legs use the assigned ambulance's dimensions, including in cached-leg keys.

No mathematical defect was found in those current model checks. The coefficients,
one-metre narrowness margin, synthetic severity policy and hospital slot assumptions
remain experimental and uncalibrated. Correct penalties cannot guarantee the
finite QAOA optimizer samples an optimum. Its three-served-choice shortlist can
exclude the full optimum; comparison with full and retained exact baselines must
remain explicit. The Kochi attribute index is not statewide coverage.
