"use client";

import { Suspense } from "react";
import GaleriaPublica from "./GaleriaPublica";

export default function GaleriaPage() {
  return (
    <Suspense fallback={null}>
      <GaleriaPublica />
    </Suspense>
  );
}
