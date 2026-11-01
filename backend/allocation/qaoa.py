"""Local noiseless Qiskit QAOA; classical optimization of quantum expectation."""
from time import perf_counter

from backend.models.route import Model
from backend.allocation.qubo import Choice, valid_bits


class QuantumResult(Model):
    status: str
    message: str = ''
    assignments: list[Choice] | None = None
    objective: float | None = None
    runtime_ms: float = 0
    evaluations: int = 0
    shots: int = 0
    feasible_probability: float = 0
    feasible_sample_fraction: float = 0
    circuit_depth: int = 0
    expectation_trace: list[float] = []
    parameters: list[float] = []
    optimizer_message: str = ''


def ising_terms(problem):
    offset, z, zz = problem.offset, {}, {}
    for (i, j), coefficient in problem.q.items():
        if i == j:
            offset += coefficient / 2
            z[i] = z.get(i, 0) - coefficient / 2
        else:
            offset += coefficient / 4
            z[i] = z.get(i, 0) - coefficient / 4
            z[j] = z.get(j, 0) - coefficient / 4
            zz[i, j] = coefficient / 4
    return offset, z, zz


def solve_qaoa(problem, options):
    start = perf_counter()
    try:
        import numpy as np
        from qiskit import QuantumCircuit
        from qiskit.quantum_info import Statevector
        from scipy.optimize import minimize
    except ImportError:
        return QuantumResult(status='unavailable', message='Install requirements-quantum.txt to run local QAOA.')

    n = len(problem.choices)
    _, z, zz = ising_terms(problem)
    scale = max(1, max(abs(v) for v in problem.q.values()))
    indices = np.arange(2**n, dtype=np.int64)
    bits = ((indices[:, None] >> np.arange(n)) & 1).astype(np.int8)
    energies = np.full(2**n, problem.offset, dtype=float)
    for (i, j), value in problem.q.items():
        energies += value * bits[:, i] * bits[:, j]
    trace = []
    best = [float('inf'), None]

    def circuit(theta):
        qc = QuantumCircuit(n)
        qc.h(range(n))
        for layer in range(options.reps):
            gamma, beta = theta[2 * layer:2 * layer + 2]
            for i, value in z.items():
                qc.rz(2 * gamma * value / scale, i)
            for (i, j), value in zz.items():
                qc.rzz(2 * gamma * value / scale, i, j)
            qc.rx(2 * beta, range(n))
        return qc

    def evaluate(theta):
        probabilities = Statevector.from_instruction(circuit(theta)).probabilities()
        energy = float(probabilities @ energies)
        trace.append(energy)
        if energy < best[0]:
            best[:] = [energy, theta.copy()]
        return energy / scale

    rng = np.random.default_rng(options.seed)
    optimized = minimize(evaluate, rng.uniform(0, np.pi, 2 * options.reps), method='COBYLA',
                         options={'maxiter': options.maxiter, 'rhobeg': 0.5})
    # Use the best evaluated parameters even when COBYLA exhausts its budget.
    qc = circuit(best[1])
    probabilities = Statevector.from_instruction(qc).probabilities()
    counts = rng.multinomial(options.shots, probabilities / probabilities.sum())
    feasible = np.array([valid_bits(problem, b) for b in bits])
    sampled = np.flatnonzero((counts > 0) & feasible)
    chosen = int(min(sampled, key=lambda index: energies[index])) if len(sampled) else None
    assignments = ([c for c, bit in zip(problem.choices, bits[chosen]) if bit] if chosen is not None else None)
    return QuantumResult(status='completed', assignments=assignments,
                         objective=sum(c.cost for c in assignments) if assignments is not None else None,
                         runtime_ms=(perf_counter() - start) * 1000, evaluations=len(trace), shots=options.shots,
                         feasible_probability=float(probabilities[feasible].sum()),
                         feasible_sample_fraction=float(counts[feasible].sum() / options.shots),
                         circuit_depth=qc.depth(), expectation_trace=trace,
                         parameters=best[1].tolist(), optimizer_message=str(optimized.message),
                         message='Noiseless local statevector simulation; no quantum hardware was used.')
