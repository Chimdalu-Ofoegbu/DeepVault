// ===========================================================================
// AUTO-GENERATED - DO NOT EDIT
// Source: shared/cody_phi_coefficients.toml (schema_version 1)
// Regenerate via: make codegen   (or: python scripts/codegen.py)
// ===========================================================================

module deepvault::phi_coefficients {
    // Small range threshold (|x| < 0.66291)
    public fun small_threshold(): u128 { 662_910_000 }

    // Small range numerator P(x^2)
    public fun small_a0(): u128 { 2_235_252_035 }
    public fun small_a1(): u128 { 161_028_231_069 }
    public fun small_a2(): u128 { 1_067_689_485_460 }
    public fun small_a3(): u128 { 18_154_981_253_344 }
    public fun small_a4(): u128 { 65_682_338 }

    // Small range denominator Q(x^2)
    public fun small_b0(): u128 { 47_202_581_905 }
    public fun small_b1(): u128 { 976_098_551_738 }
    public fun small_b2(): u128 { 10_260_932_208_619 }
    public fun small_b3(): u128 { 45_507_789_335_027 }

    // Medium range threshold (0.66291 <= |x| < sqrt(32))
    public fun medium_threshold(): u128 { 5_656_854_249 }

    // Medium range numerator P(|x|)
    public fun medium_c0(): u128 { 398_941_512 }
    public fun medium_c1(): u128 { 8_883_149_794 }
    public fun medium_c2(): u128 { 93_506_656_132 }
    public fun medium_c3(): u128 { 597_270_276_395 }
    public fun medium_c4(): u128 { 2_494_537_585_290 }
    public fun medium_c5(): u128 { 6_848_190_450_536 }
    public fun medium_c6(): u128 { 11_602_651_437_647 }
    public fun medium_c7(): u128 { 9_842_714_838_384 }
    public fun medium_c8(): u128 { 11 }

    // Medium range denominator Q(|x|)
    public fun medium_d0(): u128 { 22_266_688_044 }
    public fun medium_d1(): u128 { 235_387_901_782 }
    public fun medium_d2(): u128 { 1_519_377_599_408 }
    public fun medium_d3(): u128 { 6_485_558_298_267 }
    public fun medium_d4(): u128 { 18_615_571_640_885 }
    public fun medium_d5(): u128 { 34_900_952_721_146 }
    public fun medium_d6(): u128 { 38_912_003_286_093 }
    public fun medium_d7(): u128 { 19_685_429_676_860 }

    // Auxiliary constants (LN2 etc.)
    public fun ln2_u128(): u128 { 693_147_180 }
}
