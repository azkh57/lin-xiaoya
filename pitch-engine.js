// Lin Xiaoya - Pitch Engine
// YIN-based pitch detection
// Stage 1: raw pitch tracking for Mandarin tone contour testing.


function differenceFunction(buffer, maxTau) {

  const differences =
    new Float32Array(maxTau);

  for (let tau = 1; tau < maxTau; tau++) {

    let sum = 0;

    for (
      let i = 0;
      i < buffer.length - tau;
      i++
    ) {

      const difference =
        buffer[i] - buffer[i + tau];

      sum += difference * difference;
    }

    differences[tau] = sum;
  }

  return differences;
}


function cumulativeMeanNormalizedDifference(
  differences
) {

  const normalized =
    new Float32Array(
      differences.length
    );

  normalized[0] = 1;

  let runningSum = 0;

  for (
    let tau = 1;
    tau < differences.length;
    tau++
  ) {

    runningSum += differences[tau];

    if (runningSum === 0) {

      normalized[tau] = 1;

    } else {

      normalized[tau] =
        differences[tau] *
        tau /
        runningSum;
    }
  }

  return normalized;
}


function parabolicInterpolation(
  values,
  index
) {

  if (
    index <= 0 ||
    index >= values.length - 1
  ) {
    return index;
  }

  const left =
    values[index - 1];

  const center =
    values[index];

  const right =
    values[index + 1];

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
    options.minFrequency ?? 70;

  const maxFrequency =
    options.maxFrequency ?? 500;

  const threshold =
    options.threshold ?? 0.15;


  /*
    محدود کردن بازه فرکانس انسانی

    70 Hz  → صدای بم
    500 Hz → محدوده مناسب برای تست اولیه
  */

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


  if (
    maxTau <= minTau + 2
  ) {

    return {
      pitch: null,
      clarity: 0
    };
  }


  /*
    مرحله ۱
    Difference function
  */

  const differences =
    differenceFunction(
      buffer,
      maxTau
    );


  /*
    مرحله ۲
    Cumulative Mean Normalized Difference
  */

  const normalized =
    cumulativeMeanNormalizedDifference(
      differences
    );


  /*
    پیدا کردن اولین minimum معتبر YIN

    این روش به YIN استاندارد نزدیک‌تر است.
    به‌جای انتخاب عمیق‌ترین minimum در کل بازه،
    اولین minimum معتبر زیر threshold
    را انتخاب می‌کنیم.

    این کار احتمال انتخاب هارمونیک
    به‌جای فرکانس اصلی را کمتر می‌کند.
  */

  let bestTau = -1;

  for (
    let tau = minTau + 1;
    tau < maxTau - 1;
    tau++
  ) {

    const value =
      normalized[tau];

    if (
      value < threshold &&
      value <= normalized[tau - 1] &&
      value <= normalized[tau + 1]
    ) {

      bestTau = tau;
      break;

    }

  }

  let bestValue =
    bestTau !== -1
      ? normalized[bestTau]
      : Infinity;


  if (
    bestTau === -1 ||
    bestValue > threshold
  ) {

    return {
      pitch: null,
      clarity: 0
    };
  }


  /*
    اصلاح دقیق‌تر محل minimum
  */

  const refinedTau =
    parabolicInterpolation(
      normalized,
      bestTau
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


  /*
    تبدیل Period به Frequency
  */

  const pitch =
    sampleRate /
    refinedTau;


  /*
    confidence / clarity

    هرچه minimum عمیق‌تر باشد،
    وضوح تشخیص بیشتر است.
  */

  const clarity =
    Math.max(
      0,
      Math.min(
        1,
        1 - bestValue
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


/*
  Tracker

  در این مرحله عمداً:

  ❌ smoothing نداریم
  ❌ octave correction نداریم
  ❌ median history نداریم

  هدف:
  دیدن حرکت واقعی Pitch است.
*/

function createPitchTracker(
  options = {}
) {

  const settings = {

    minFrequency:
      options.minFrequency ?? 70,

    maxFrequency:
      options.maxFrequency ?? 500,

    threshold:
      options.threshold ?? 0.15

  };


  return {

    detect(
      buffer,
      sampleRate
    ) {

      return yinDetect(
        buffer,
        sampleRate,
        settings
      );

    },


    getHistory() {

      return [];

    },


    reset() {

      // در مرحله اول چیزی برای reset وجود ندارد.

    }

  };
}
