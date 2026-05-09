// ===========================================================================
// AUTO-GENERATED - DO NOT EDIT
// Source: shared/cody_phi_coefficients.toml (schema_version 1)
// Regenerate via: make codegen   (or: python scripts/codegen.py)
// ===========================================================================

export const PHI_COEFFICIENTS = {
  // Small range threshold (|x| < 0.66291)
  SMALL_THRESHOLD: 662_910_000n,

  // Small range numerator P(x^2)
  SMALL_A0: 2_235_252_035n,
  SMALL_A1: 161_028_231_069n,
  SMALL_A2: 1_067_689_485_460n,
  SMALL_A3: 18_154_981_253_344n,
  SMALL_A4: 65_682_338n,

  // Small range denominator Q(x^2)
  SMALL_B0: 47_202_581_905n,
  SMALL_B1: 976_098_551_738n,
  SMALL_B2: 10_260_932_208_619n,
  SMALL_B3: 45_507_789_335_027n,

  // Medium range threshold (0.66291 <= |x| < sqrt(32))
  MEDIUM_THRESHOLD: 5_656_854_249n,

  // Medium range numerator P(|x|)
  MEDIUM_C0: 398_941_512n,
  MEDIUM_C1: 8_883_149_794n,
  MEDIUM_C2: 93_506_656_132n,
  MEDIUM_C3: 597_270_276_395n,
  MEDIUM_C4: 2_494_537_585_290n,
  MEDIUM_C5: 6_848_190_450_536n,
  MEDIUM_C6: 11_602_651_437_647n,
  MEDIUM_C7: 9_842_714_838_384n,
  MEDIUM_C8: 11n,

  // Medium range denominator Q(|x|)
  MEDIUM_D0: 22_266_688_044n,
  MEDIUM_D1: 235_387_901_782n,
  MEDIUM_D2: 1_519_377_599_408n,
  MEDIUM_D3: 6_485_558_298_267n,
  MEDIUM_D4: 18_615_571_640_885n,
  MEDIUM_D5: 34_900_952_721_146n,
  MEDIUM_D6: 38_912_003_286_093n,
  MEDIUM_D7: 19_685_429_676_860n,

  // Auxiliary constants (LN2 etc.)
  LN2_U128: 693_147_180n,
} as const;
