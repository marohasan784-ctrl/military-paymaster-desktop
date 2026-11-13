function calculateNetSalary({ baseSalary, allowances, deductions }) {
  for (const [name, value] of Object.entries({ baseSalary, allowances, deductions })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative finite number.`);
    }
  }

  return baseSalary + allowances - deductions;
}

module.exports = { calculateNetSalary };
