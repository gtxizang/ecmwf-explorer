#!/usr/bin/env python3
"""
Quick test script to verify the MCP server can access the remote Zarr data.
Run with: python test_data_access.py
"""

import asyncio
import json
import httpx

BASE_URL = "https://ecmwf.regexflow.com/zarr"


async def test_data_access():
    """Test that we can access the Zarr data."""

    print("Testing ECV MCP Server data access...\n")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1: Check soil moisture metadata
        print("1. Testing soil_moisture_multiyear access...")
        url = f"{BASE_URL}/soil_moisture_multiyear/0/.zattrs"
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                print(f"   ✓ Accessible: {url}")
                zattrs = json.loads(resp.content)
                print(f"   Metadata: {json.dumps(zattrs, indent=2)[:200]}...")
            else:
                print(f"   ✗ Failed: HTTP {resp.status_code}")
        except Exception as e:
            print(f"   ✗ Error: {e}")

        # Test 2: Check sea ice metadata
        print("\n2. Testing sea_ice_polar_multiyear access...")
        url = f"{BASE_URL}/sea_ice_polar_multiyear/0/.zattrs"
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                print(f"   ✓ Accessible: {url}")
            else:
                print(f"   ✗ Failed: HTTP {resp.status_code}")
        except Exception as e:
            print(f"   ✗ Error: {e}")

        # Test 3: Check coordinate arrays
        print("\n3. Testing coordinate array access (soil moisture x)...")
        url = f"{BASE_URL}/soil_moisture_multiyear/0/x/.zarray"
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                print(f"   ✓ Coordinate metadata accessible")
                zarray = json.loads(resp.content)
                print(f"   Shape: {zarray.get('shape')}, Dtype: {zarray.get('dtype')}")
            else:
                print(f"   ✗ Failed: HTTP {resp.status_code}")
        except Exception as e:
            print(f"   ✗ Error: {e}")

        # Test 4: Check a data chunk
        print("\n4. Testing data chunk access (soil_moisture year=0, month=0, chunk 0,0)...")
        url = f"{BASE_URL}/soil_moisture_multiyear/0/soil_moisture/0.0.0.0"
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                print(f"   ✓ Data chunk accessible ({len(resp.content)} bytes)")
            else:
                print(f"   ✗ Failed: HTTP {resp.status_code}")
        except Exception as e:
            print(f"   ✗ Error: {e}")

    print("\n" + "=" * 50)
    print("Data access tests complete!")
    print("If all tests passed, the MCP server should work correctly.")


if __name__ == "__main__":
    asyncio.run(test_data_access())
