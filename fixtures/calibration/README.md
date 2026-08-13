# Calibration fixtures

These files are deliberately small, synthetic pipeline fixtures. They are
marked `synthetic` and `notHumanCalibrationData` in every committed JSON file.
They do not demonstrate expert review, human calibration, or a validated gold
standard.

The fixture contains one candidate response, two independent-looking synthetic
annotation streams, and synthetic adjudications so the validation, agreement,
blind export, report, and aggregation paths can be exercised locally.

Real reviewer files should remain in an ignored private location. They should
use the same machine-readable contracts, pseudonymous reviewer IDs, and
case/rubric version identities.
