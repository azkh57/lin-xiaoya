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

/*
  Stage 2 Pitch Tracker

  هدف:
  جلوگیری از پرش‌های ناگهانی Pitch
  و اصلاح خطاهای octave / harmonic
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
      options.threshold ?? 0.15,

    maxJumpRatio:
      options.maxJumpRatio ?? 1.60,

    smoothing:
      options.smoothing ?? 5

  };


  const history = [];


  return {

    detect(
      buffer,
      sampleRate
    ) {

      const detected =
        yinDetect(
          buffer,
          sampleRate,
          settings
        );


      let pitch =
        detected.pitch;


      /*
        اگر Pitch معتبر نیست،
        چیزی به history اضافه نمی‌کنیم.
      */

      if (
        pitch === null ||
        detected.clarity < 0.5
      ) {

        return {
          pitch: null,
          clarity: detected.clarity
        };

      }


      /*
        اگر قبلاً Pitch معتبر داشتیم،
        خطاهای octave را بررسی می‌کنیم.
      */

      if (history.length > 0) {

        const previous =
          history[history.length - 1];


        const ratio =
          pitch / previous;


        /*
          یک octave پایین‌تر
        */

        if (
          ratio > 0.45 &&
          ratio < 0.55
        ) {

          pitch =
            pitch * 2;

        }


        /*
          یک octave بالاتر
        */

        else if (
          ratio > 1.8 &&
          ratio < 2.2
        ) {

          pitch =
            pitch / 2;

        }


        /*
          اگر هنوز پرش خیلی بزرگ بود،
          این فریم را مشکوک در نظر می‌گیریم.
        */

        const correctedRatio =
          pitch / previous;


       

      }


      /*
        ذخیره Pitch معتبر
      */

      history.push(pitch);


      if (
        history.length > 20
      ) {

        history.shift();

      }


      /*
        Median smoothing

        به‌جای میانگین،
        median انتخاب می‌شود تا
        پرش‌های شدید اثر کمتری داشته باشند.
      */

      const recent =
        history.slice(
          -settings.smoothing
        );


      const sorted =
        [...recent].sort(
          (a, b) => a - b
        );


      const middle =
        Math.floor(
          sorted.length / 2
        );


      const smoothed =
        sorted.length % 2 === 0

          ? (
              sorted[middle - 1] +
              sorted[middle]
            ) / 2

          : sorted[middle];


      return {

        pitch:
          smoothed,

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
