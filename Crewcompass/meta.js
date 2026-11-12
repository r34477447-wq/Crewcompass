// Static facts for the About page.
export const META = {
 "requirements": [
  {
   "id": "NASA-STD-3001 [V2 6001]",
   "what": "Trend analysis of the environment",
   "how": "Rolling CO2 averages and series on the Environment screen."
  },
  {
   "id": "NASA-STD-3001 [V2 6020-6022]",
   "what": "Atmospheric monitoring and alerting",
   "how": "1-hour and 7-day CO2 status against 3 mmHg and 2.5 mmHg."
  },
  {
   "id": "NASA-STD-3001 [V2 6107]",
   "what": "Health monitoring support",
   "how": "Daily CrewCheck and personal baseline."
  },
  {
   "id": "NASA-STD-3001 [V1 3003]",
   "what": "Medical care and decision support",
   "how": "Action cards with escalation to the crew medical officer."
  },
  {
   "id": "NASA-STD-3001 [V1 3004]",
   "what": "Medical data handling",
   "how": "Local storage, callsigns only, no raw data in the digest."
  }
 ],
 "requirements_note": "Mapping is our reading of the standard; confirm wording against the current release.",
 "sources": [
  {
   "name": "OSDR Environmental Data Application (EDA)",
   "url": "https://www.nasa.gov/reference/osdr-environmental-data/",
   "use": "CO2, temperature, humidity and radiation series (Rodent Research experiment conditions, used as a stand-in for cabin sensors)."
  },
  {
   "name": "RadLab portal and Data API",
   "url": "https://visualization.osdr.nasa.gov/radlab/gui/overview/",
   "use": "Radiation dosimetry context. Doses are accurate to about 10%."
  },
  {
   "name": "NASA CO2 technical brief OCHMO-TB-004 Rev D",
   "url": null,
   "use": "CO2 thresholds and the CO2-headache analysis (PDF supplied by the team)."
  },
  {
   "name": "NTRS 20170004604",
   "url": "https://ntrs.nasa.gov/citations/20170004604",
   "use": "Background."
  },
  {
   "name": "NTRS 20140010667",
   "url": "https://ntrs.nasa.gov/citations/20140010667",
   "use": "Background."
  }
 ],
 "acknowledgement": "Radiation dose data: Space Radiation Analysis Group (SRAG), NASA Johnson Space Center, via NASA OSDR. SRAG consultation is required before publishing or presenting results.",
 "disclaimer": "Decision support, not a medical device. Serious signs go to the crew medical officer. Action cards in this prototype are examples to be authored and approved by flight surgeons."
};
