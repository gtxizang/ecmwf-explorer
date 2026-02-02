#!/usr/bin/env python3
"""
Data validation tests for climate datasets.
Run after processing to catch issues before they reach the frontend.
"""

import sys
import zarr
import numpy as np
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
PYRAMIDS_DIR = BASE_DIR / "data" / "pyramids"

MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def validate_radiation_budget():
    """Validate the radiation budget dataset."""
    print("\n" + "="*60)
    print("VALIDATING: Solar Radiation Dataset")
    print("="*60)

    errors = []
    warnings = []

    zarr_dir = PYRAMIDS_DIR / "radiation_budget_cp" / "3"

    if not zarr_dir.exists():
        errors.append(f"Dataset not found: {zarr_dir}")
        return errors, warnings

    arr = zarr.open(zarr_dir / 'solar_mon')
    y_arr = zarr.open(zarr_dir / 'y')
    y = y_arr[:]

    print(f"Array shape: {arr.shape}")

    # Test 1: Check we have 12 months
    print("\n[TEST 1] Monthly data completeness...")
    if arr.shape[0] != 12:
        errors.append(f"Expected 12 months, got {arr.shape[0]}")
    else:
        print(f"  ✓ Has 12 months")

    # Test 2: Check each month has data
    print("\n[TEST 2] Each month has valid data...")
    for t in range(min(12, arr.shape[0])):
        data = arr[t]
        valid_pct = 100 * (~np.isnan(data)).sum() / data.size
        if valid_pct < 80:
            errors.append(f"Month {t} ({MONTHS[t]}): Only {valid_pct:.1f}% valid (expected >80%)")
        else:
            print(f"  ✓ Month {t} ({MONTHS[t]}): {valid_pct:.1f}% valid")

    # Test 3: Check data covers both hemispheres
    print("\n[TEST 3] Hemispheric coverage...")
    data_jan = arr[0]

    # Find equator row
    equator_idx = np.argmin(np.abs(y))
    north_data = data_jan[:equator_idx, :]
    south_data = data_jan[equator_idx:, :]

    north_valid = (~np.isnan(north_data)).sum() / north_data.size * 100
    south_valid = (~np.isnan(south_data)).sum() / south_data.size * 100

    if north_valid < 70:
        errors.append(f"Northern hemisphere: Only {north_valid:.1f}% valid (expected >70%)")
    else:
        print(f"  ✓ Northern hemisphere: {north_valid:.1f}% valid")

    if south_valid < 70:
        errors.append(f"Southern hemisphere: Only {south_valid:.1f}% valid (expected >70%)")
    else:
        print(f"  ✓ Southern hemisphere: {south_valid:.1f}% valid")

    # Test 4: Check latitudinal variation for January (southern summer)
    print("\n[TEST 4] Latitudinal variation (January - expect high in south)...")

    # Sample at different latitudes
    north_row = int(arr.shape[1] * 0.1)  # ~70°N
    equator_row = equator_idx
    south_row = int(arr.shape[1] * 0.9)  # ~70°S

    north_mean = np.nanmean(data_jan[north_row, :])
    equator_mean = np.nanmean(data_jan[equator_row, :])
    south_mean = np.nanmean(data_jan[south_row, :])

    print(f"  North (~70°N): {north_mean:.1f} W/m²")
    print(f"  Equator: {equator_mean:.1f} W/m²")
    print(f"  South (~70°S): {south_mean:.1f} W/m²")

    # In January, southern hemisphere should have MORE radiation
    if south_mean <= north_mean:
        errors.append(f"January: South ({south_mean:.1f}) should be > North ({north_mean:.1f}) - data may be inverted!")
    else:
        print(f"  ✓ Correct pattern: South > North for January")

    # Test 5: Check for unexpected zeros in valid areas
    print("\n[TEST 5] Checking for unexpected zeros...")
    # In equatorial regions, there should be no zeros (always some solar radiation)
    equator_band = data_jan[equator_idx-50:equator_idx+50, :]
    zero_count = (equator_band == 0).sum()
    zero_pct = 100 * zero_count / equator_band.size

    if zero_pct > 5:
        errors.append(f"Equatorial band has {zero_pct:.1f}% zeros (expected <5%) - possible data corruption")
    else:
        print(f"  ✓ Equatorial band: {zero_pct:.1f}% zeros (acceptable)")

    # Test 6: July should have opposite pattern (high in north)
    print("\n[TEST 6] July pattern (expect high in north)...")
    if arr.shape[0] >= 7:
        data_jul = arr[6]  # July is index 6
        north_jul = np.nanmean(data_jul[north_row, :])
        south_jul = np.nanmean(data_jul[south_row, :])

        print(f"  North (~70°N): {north_jul:.1f} W/m²")
        print(f"  South (~70°S): {south_jul:.1f} W/m²")

        if north_jul <= south_jul:
            warnings.append(f"July: Expected North > South, but North={north_jul:.1f}, South={south_jul:.1f}")
        else:
            print(f"  ✓ Correct pattern: North > South for July")

    return errors, warnings


def validate_soil_moisture():
    """Validate the soil moisture dataset."""
    print("\n" + "="*60)
    print("VALIDATING: Soil Moisture Dataset")
    print("="*60)

    errors = []
    warnings = []

    zarr_dir = PYRAMIDS_DIR / "soil_moisture_cp" / "5"

    if not zarr_dir.exists():
        errors.append(f"Dataset not found: {zarr_dir}")
        return errors, warnings

    arr = zarr.open(zarr_dir / 'swvl1')

    print(f"Array shape: {arr.shape}")

    # Test 1: Check we have 12 months
    print("\n[TEST 1] Monthly data completeness...")
    if arr.shape[0] != 12:
        errors.append(f"Expected 12 months, got {arr.shape[0]}")
    else:
        print(f"  ✓ Has 12 months")

    # Test 2: Check each month has data
    print("\n[TEST 2] Each month has valid data...")
    for t in range(min(12, arr.shape[0])):
        data = arr[t]
        # Soil moisture uses -9999 as fill value
        valid_count = ((data != -9999) & (~np.isnan(data))).sum()
        valid_pct = 100 * valid_count / data.size
        if valid_pct < 30:  # Lower threshold - oceans are masked
            errors.append(f"Month {t} ({MONTHS[t]}): Only {valid_pct:.1f}% valid (expected >30%)")
        else:
            print(f"  ✓ Month {t} ({MONTHS[t]}): {valid_pct:.1f}% valid")

    # Test 3: Check value range
    print("\n[TEST 3] Value range check...")
    data = arr[0]
    valid_data = data[(data != -9999) & (~np.isnan(data))]

    if len(valid_data) == 0:
        errors.append("No valid data found")
    else:
        min_val = valid_data.min()
        max_val = valid_data.max()
        print(f"  Range: {min_val:.3f} to {max_val:.3f} m³/m³")

        if min_val < 0:
            errors.append(f"Negative soil moisture values found: {min_val}")
        elif max_val > 1:
            warnings.append(f"Soil moisture > 1.0 found: {max_val}")
        else:
            print(f"  ✓ Values in valid range [0, 1]")

    return errors, warnings


def main():
    print("="*60)
    print("CLIMATE DATA VALIDATION SUITE")
    print("="*60)

    all_errors = []
    all_warnings = []

    # Validate radiation
    errors, warnings = validate_radiation_budget()
    all_errors.extend(errors)
    all_warnings.extend(warnings)

    # Validate soil moisture
    errors, warnings = validate_soil_moisture()
    all_errors.extend(errors)
    all_warnings.extend(warnings)

    # Summary
    print("\n" + "="*60)
    print("VALIDATION SUMMARY")
    print("="*60)

    if all_warnings:
        print(f"\n⚠️  WARNINGS ({len(all_warnings)}):")
        for w in all_warnings:
            print(f"   - {w}")

    if all_errors:
        print(f"\n❌ ERRORS ({len(all_errors)}):")
        for e in all_errors:
            print(f"   - {e}")
        print("\n❌ VALIDATION FAILED")
        return 1
    else:
        print("\n✅ ALL VALIDATIONS PASSED")
        return 0


if __name__ == "__main__":
    sys.exit(main())
