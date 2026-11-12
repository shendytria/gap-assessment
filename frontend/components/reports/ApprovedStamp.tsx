import React from "react";

/**
 * Red rectangular "APPROVED" electronic-signature stamp matching the official
 * WI-QO-QS-1023.04 Lampiran 1 signature template.
 */
export default function ApprovedStamp({
  width = 68,
  height = 20,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 116 32"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="APPROVED"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <rect
        x="1.5"
        y="1.5"
        width="113"
        height="29"
        fill="#ffffff"
        stroke="#c00000"
        strokeWidth="2.4"
      />
      <rect
        x="4"
        y="4"
        width="108"
        height="24"
        fill="none"
        stroke="#c00000"
        strokeWidth="0.7"
      />
      <text
        x="58"
        y="21.5"
        textAnchor="middle"
        fill="#c00000"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontWeight="700"
        fontSize="14.5"
        letterSpacing="1.1"
      >
        APPROVED
      </text>
    </svg>
  );
}
