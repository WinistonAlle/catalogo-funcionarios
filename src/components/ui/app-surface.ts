import styled, { keyframes } from "styled-components";

export const colors = {
  primaryLight: "#ff4d4d",
  primary: "#b82626",
  primaryDark: "#7d1717",
};

const glow = keyframes`
  from { box-shadow: 0 0 0 rgba(125,23,23,0); }
  to   { box-shadow: 0 20px 80px rgba(125,23,23,.35); }
`;

export const Bg = styled.div`
  min-height: 100svh;
  width: 100%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(1200px 800px at 70% -10%, ${colors.primaryLight}, transparent 60%),
    radial-gradient(1000px 600px at -10% 110%, ${colors.primary}, ${colors.primaryDark});
`;

export const Card = styled.div`
  width: 92%;
  max-width: 440px;
  background: #fff;
  border-radius: 24px;
  padding: 28px;
  animation: ${glow} 600ms ease-out forwards;
  border: 1px solid #f1f1f1;
  transition: transform .2s ease;
  &:hover { transform: translateY(-2px); }
`;
