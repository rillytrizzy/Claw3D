export const shouldShowPixelHotelBackdrop = ({
  immersiveOverlayActive,
  agentCount,
}: {
  immersiveOverlayActive: boolean;
  agentCount: number;
}): boolean => !immersiveOverlayActive && agentCount === 0;
