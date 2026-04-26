# brain/core/ionpump/ionpump_validator.py

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

import yaml

from brain.core.ionpump.ionpump_models import IonRecipe

logger = logging.getLogger(__name__)

_VAR_PATTERN = re.compile(r"\$\{([^}]+)\}")


@dataclass
class ValidationResult:
    valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class IonValidator:
    """
    Validates .ion files and already-parsed IonRecipe objects.
    Never raises exceptions — always returns a ValidationResult.
    """

    # ------------------------------------------------------------------
    # File-level validation
    # ------------------------------------------------------------------

    def validate_file(self, path: Path) -> ValidationResult:
        """Validate a .ion file at the given path. Does not raise."""
        errors: List[str] = []
        warnings: List[str] = []

        if not path.exists():
            return ValidationResult(valid=False, errors=[f"File not found: {path}"])

        try:
            with path.open("r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            return ValidationResult(valid=False, errors=[f"YAML parse error: {exc}"])
        except OSError as exc:
            return ValidationResult(valid=False, errors=[f"Cannot read file: {exc}"])

        if not isinstance(data, dict):
            return ValidationResult(
                valid=False, errors=["Root element must be a YAML mapping."]
            )

        # Basic structural checks before constructing an IonRecipe
        for required_key in ("version", "site", "flows"):
            if required_key not in data:
                errors.append(f"Missing required field: '{required_key}'")

        if errors:
            return ValidationResult(valid=False, errors=errors, warnings=warnings)

        # Build a lightweight IonRecipe for deeper validation
        try:
            from brain.core.ionpump.ionpump_loader import IonLoader
            loader = IonLoader.__new__(IonLoader)
            recipe = loader._parse_ion_file(path)
        except Exception as exc:
            return ValidationResult(valid=False, errors=[f"Failed to parse recipe: {exc}"])

        result = self.validate_recipe(recipe)
        return result

    # ------------------------------------------------------------------
    # Recipe-level validation
    # ------------------------------------------------------------------

    def validate_recipe(self, recipe: IonRecipe) -> ValidationResult:
        """
        Validate an already-parsed IonRecipe.
        Checks:
        - Required fields: version, site, flows
        - Every flow has at least one step
        - transition.to targets exist in the same recipe
        - ${var} references are declared in variables{}
        - requires[] references events, not flows
        """
        errors: List[str] = []
        warnings: List[str] = []

        # Required top-level fields
        if not recipe.version:
            errors.append("Field 'version' is required and must not be empty.")
        if not recipe.site:
            errors.append("Field 'site' is required and must not be empty.")
        if not recipe.flows:
            errors.append("Field 'flows' must contain at least one flow.")

        flow_names = set(recipe.flows.keys())
        declared_vars = set(recipe.variables.keys())

        for flow_name, flow in recipe.flows.items():
            # Each flow must have at least one step
            if not flow.steps:
                errors.append(f"Flow '{flow_name}' must have at least one step.")

            for step_idx, step in enumerate(flow.steps):
                step_label = f"flow '{flow_name}', step {step_idx}"

                # transition.to must reference an existing flow
                if step.action == "transition":
                    target = step.params.get("to")
                    if target is None:
                        errors.append(f"{step_label}: 'transition' step missing 'to' param.")
                    elif target not in flow_names:
                        errors.append(
                            f"{step_label}: transition target '{target}' does not exist in this recipe."
                        )

                # Check ${var} references in all string param values
                for param_key, param_value in step.params.items():
                    if isinstance(param_value, str):
                        for var_name in _VAR_PATTERN.findall(param_value):
                            if var_name not in declared_vars:
                                warnings.append(
                                    f"{step_label}, param '{param_key}': "
                                    f"variable '${{{{var_name}}}}' is not declared in variables{{}}."
                                )

            # requires[] should reference events, not flows
            for req in flow.requires:
                if req in flow_names:
                    warnings.append(
                        f"Flow '{flow_name}': requires[] entry '{req}' matches a flow name. "
                        "requires[] should reference events, not flows."
                    )

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )
