"use client";
import { useEffect } from "react";
export default function StaffRedirect() {
  useEffect(() => { window.location.replace("/acesso"); }, []);
  return <p style={{ textAlign: "center", marginTop: "3rem", color: "#999" }}>Redirecionando...</p>;
}
