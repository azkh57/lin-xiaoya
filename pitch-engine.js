// Lin Xiaoya - Pitch Engine
// Inspired by standard YIN pitch-detection techniques.
// This file is intentionally independent from the UI.

function median(values) {
  if (!values || values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}


function differenceFunction(buffer, maxTau) {
  const differences = new Float32Array(maxTau);

  for (let tau = 1; tau < maxTau; tau++) {
    let sum = 0;

    for (let i = 0; i < buffer.length - tau; i++) {
      const difference =
        buffer[i] - buffer[i + tau];

      sum += difference * difference;
    }

    differences[tau] = sum;
  }

  return differences;
}


function cumulativeMeanNormalizedDifference(differences) {
  const result =
    new Float32Array(differences.length);

  result[0] = 1;

  let runningSum = 0;

  for (let tau = 1; tau < differences.length; tau++) {
    runningSum += differences[tau];

    if (runningSum === 0) {
      result[tau] = 1;
    } else {
      result[tau] =
        differences[tau] *
        tau /
        runningSum;
    }
  }

  return result;
}


function parabolicInterpolation(values, index) {
  if (
    index <= 0 ||
    index >= values.length - 1
  ) {
    return index;
  }

  const left = values[index - 1];
  const center = values[index];
  const right = values[index + 1];

  const denominator =
    left -
    2 * center +
    right;

  if (denominator === 0) {
    return index;
  }

  const adjustment =
    0.5 *
    (left - right) /
    denominator;

  return index + adjustment;
}


function yinDetect(
  buffer,
  sampleRate,
  options = {}
) {

  const minFrequency =
    options.minFrequency || 80;

  const maxFrequency =
    options.maxFrequency || 600;

  const threshold =
    options.threshold || 0.15;

  const minTau =
    Math.floor(
      sampleRate / maxFrequency
    );

  const maxTau =
    Math.min(
      Math.floor(
        sampleRate / minFrequency
      ),
      Math.floor(buffer.length / 2)
    );

  if (maxTau <= minTau + 2) {
    return {
      pitch: null,
      clarity: 0
    };
  }

  const differences =
    differenceFunction(
      buffer,
      maxTau
    );

  const normalized =
    cumulativeMeanNormalizedDifference(
      differences
    );

  let tau = -1;

  for (
    let i = minTau;
    i < maxTau;
    i++
  ) {

    if (
      normalized[i] < threshold
    ) {

      while (
        i + 1 < maxTau &&
        normalized[i + 1] <
          normalized[i]
      ) {
        i++;
      }

      tau = i;
      break;
    }
  }

  if (tau === -1) {
    return {
      pitch: null,
      clarity: 0
    };
  }

  const refinedTau =
    parabolicInterpolation(
      normalized,
      tau
    );

  if (
    !Number.isFinite(refinedTau) ||
    refinedTau <= 0
  ) {
    return {
      pitch: null,
      clarity: 0
    };
  }

  const pitch =
    sampleRate / refinedTau;

  const clarity =
    Math.max(
      0,
      Math.min(
        1,
        1 - normalized[tau]
      )
    );

  if (
    pitch < minFrequency ||
    pitch > maxFrequency
  ) {
    return {
      pitch: null,
      clarity: 0
    };
  }

  return {
    pitch,
    clarity
  };
}


function correctOctaveError(
  pitch,
  history
) {

  if (
    pitch === null ||
    history.length < 2
  ) {
    return pitch;
  }

  const reference =
    median(history);

  if (
    reference === null ||
    reference <= 0
  ) {
    return pitch;
  }

  const ratio =
    pitch / reference;

  // احتمال تشخیص یک اکتاو بالاتر
  if (
    ratio > 1.75 &&
    ratio < 2.25
  ) {
    return pitch / 2;
  }

  // احتمال تشخیص یک اکتاو پایین‌تر
  if (
    ratio > 0.44 &&
    ratio < 0.57
  ) {
    return pitch * 2;
  }

  return pitch;
}


function smoothPitch(
  pitch,
  history,
  windowSize = 5
) {

  if (pitch === null) {
    return null;
  }

  const values = [
    ...history.slice(-(windowSize - 1)),
    pitch
  ];

  return median(values);
}


function createPitchTracker(options = {}) {

  const settings = {
    minFrequency:
      options.minFrequency || 80,

    maxFrequency:
      options.maxFrequency || 600,

    threshold:
      options.threshold || 0.15,

    smoothing:
      options.smoothing || 5,

    historySize:
      options.historySize || 20
  };

  const history = [];

  return {

    detect(buffer, sampleRate) {

      const detected =
        yinDetect(
          buffer,
          sampleRate,
          settings
        );

      let pitch =
        detected.pitch;

      if (
        pitch !== null &&
        detected.clarity >= 0.5
      ) {

        pitch =
          correctOctaveError(
            pitch,
            history
          );

        pitch =
          smoothPitch(
            pitch,
            history,
            settings.smoothing
          );

        history.push(pitch);

        if (
          history.length >
          settings.historySize
        ) {
          history.shift();
        }

      }

      return {
        pitch,
        clarity:
          detected.clarity
      };
    },

    getHistory() {
      return [...history];
    },

    reset() {
      history.length = 0;
    }

  };
}
