import { RequestHandler, Response } from 'express';
import asyncHandler from 'express-async-handler';
import moment from 'moment';
import { AuthRequest } from '../interfaces/interfaces';
import StripeOldData from '../model/stripeOldData.model';
import { fetchSubscriptions } from '../utils/utils';
import ActiveCustomerCount from '../model/activeCustomerCount.model';
import ChurnRate from '../model/churnRate.model';
import DailyActiveSubscriptionCount from '../model/dailyActiveSubscriptionCount.model';
import DailySum from '../model/dailySum.model';

const getOldActiveCustomerCounts: (time: moment.Moment) => Promise<boolean> = async (time) => {
  try {
    const monthDays: number = time.daysInMonth();
    let result: boolean = true;

    for(let days = 0; days < monthDays; days ++) {
      try {
        if(time.clone().subtract(days, 'days').startOf('date').unix() > moment().startOf('date').unix()) continue;

        const subscriptions = await fetchSubscriptions(time.clone().subtract(30 + days - 1, 'days').startOf('date').unix(), time.clone().subtract(days - 1, 'days').startOf('date').unix(), 'active');
        const activeCustomerCount = await ActiveCustomerCount.create({
          count: subscriptions.length,
          date: time.clone().subtract(days - 1, 'days').startOf('date').toDate(),
        });

        result &&= true;
      } catch(error) {
        result &&= false;
        break;
      }
    }
    return result;
  } catch(error) {
    return false;
  }
}

const getOldChurnRates: (time: moment.Moment) => Promise<boolean> = async (time) => {
  try {
    const monthDays: number = time.daysInMonth();
    let result: boolean = true;

    for(let days = 0; days < monthDays; days ++) {
      try {
        if(time.clone().subtract(days, 'days').startOf('date').unix() > moment().startOf('date').unix()) continue;

        const activeSubscriptionsAtStartLast30Days = await fetchSubscriptions(time.clone().subtract(30 + days - 1, 'days').startOf('date').unix(), time.clone().subtract(days - 1, 'days').startOf('date').unix(), 'active');
        const canceledSubscriptionsLast30Days = await fetchSubscriptions(time.clone().subtract(30 + days - 1, 'days').startOf('date').unix(), time.clone().subtract(days - 1, 'days').startOf('date').unix(), 'canceled');
    
        const numberOfActiveSubscriptionsAtStartLast30Days = activeSubscriptionsAtStartLast30Days.length;
        const numberOfCanceledSubscriptionsLast30Days = canceledSubscriptionsLast30Days.length;
    
        let churnRateLast30Days = 0;
    
        if(numberOfActiveSubscriptionsAtStartLast30Days === 0) {
          churnRateLast30Days = 0
        } else {
          churnRateLast30Days = Math.round(numberOfCanceledSubscriptionsLast30Days / numberOfActiveSubscriptionsAtStartLast30Days / 100) * 10000;
        }
        const churnRate = await ChurnRate.create({
          rate: churnRateLast30Days,
          date: time.clone().subtract(days - 1, 'days').startOf('date').toDate(),
          rate_type: 'LAST_30_DAYS',
        });
        
        result &&= true;
      } catch(error) {
        result &&= false;
        break;
      }
    }

    try {
      if(time.clone().startOf('date').unix() < moment().unix()) {
        const activeSubscriptionsAtStartLastMonth = await fetchSubscriptions(time.clone().subtract(1, 'month').startOf('month').startOf('date').unix(), time.clone().subtract(1, 'month').endOf('month').startOf('date').unix(), 'active');
        const canceledSubscriptionsLastMonth = await fetchSubscriptions(time.clone().subtract(1, 'month').startOf('month').startOf('date').unix(), time.clone().subtract(1, 'month').endOf('month').startOf('date').unix(), 'canceled');
    
        const numberOfActiveSubscriptionsAtStartLastMonth = activeSubscriptionsAtStartLastMonth.length;
        const numberOfCanceledSubscriptionsLastMonth = canceledSubscriptionsLastMonth.length;
    
        let churnRateLastMonth = 0;
    
        if(numberOfActiveSubscriptionsAtStartLastMonth === 0) {
          churnRateLastMonth = 0
        } else {
          churnRateLastMonth = Math.round(numberOfCanceledSubscriptionsLastMonth / numberOfActiveSubscriptionsAtStartLastMonth / 100) * 10000;
        }
        const churnRate = await ChurnRate.create({
          rate: churnRateLastMonth,
          date: time.clone().startOf('date').toDate(),
          rate_type: 'LAST_MONTH',
        });
  
        result &&= true;
      }
    } catch(error) {
      result &&= false;
    }

    return result;
  } catch(error) {
    return false;
  }
}

const getOldDailyActiveSubscriptionCounts: (time: moment.Moment) => Promise<boolean> = async (time) => {
  try {
    const monthDays: number = time.daysInMonth();
    let result: boolean = true;

    for(let days = 0; days < monthDays; days ++) {
      try {
        if(time.clone().subtract(days, 'days').startOf('date').unix() > moment().startOf('date').unix()) continue;

        const activeSubscriptions = await fetchSubscriptions(time.clone().subtract(30 + days - 1, 'days').startOf('date').unix(), time.clone().subtract(days - 1, 'days').startOf('date').unix(), 'active');
        const dailyActiveSubscriptionCount = await DailyActiveSubscriptionCount.create({
          count: activeSubscriptions.length,
          date: time.clone().startOf('date').subtract(days - 1, 'days').toDate(),
        });

        result &&= true;
      } catch(error) {
        result &&= false;
        break;
      }
    }
    return result;
  } catch(error) {
    return false;
  }
}

const getOldDailySums: (time: moment.Moment) => Promise<boolean> = async (time) => {
  try {
    const monthDays: number = time.daysInMonth();
    let result: boolean = true;

    for(let days = 0; days < monthDays; days ++) {
      try {
        if(time.clone().subtract(days, 'days').startOf('date').unix() > moment().startOf('date').unix()) continue;

        const activeSubscriptions = await fetchSubscriptions(time.clone().subtract(30 + days - 1, 'days').startOf('date').unix(), time.clone().startOf('date').unix(), 'active');

        const totalSum = activeSubscriptions.reduce((sum, subscription) => {
          return sum + ((subscription.items.data[0].plan.amount || 0) / 100);
        }, 0);

        const dailySum = await DailySum.create({
          sum: totalSum,
          date: time.clone().startOf('date').subtract(days - 1, 'days').toDate(),
        });
        
        result &&= true;
      } catch(error) {
        result &&= false;
        break;
      }
    }
    return result;
  } catch(error) {
    return false;
  }
}

export const createStripeOldData: RequestHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const time: moment.Moment = moment().endOf('month');

  const [activeCustomerCounts, churnRates, dailyActiveSubscriptionCounts, dailySums,] = await Promise.all([
    getOldActiveCustomerCounts(time),
    getOldChurnRates(time),
    getOldDailyActiveSubscriptionCounts(time),
    getOldDailySums(time),
  ]);
  
  const stripeOldDataRow = await StripeOldData.create({
    active_customer_counts: activeCustomerCounts,
    churn_rates: churnRates,
    daily_active_subscription_counts: dailyActiveSubscriptionCounts,
    daily_sums: dailySums,
    date: time,
  });

  res.json({
    result: stripeOldDataRow,
  });
});

export const getStripeOldData: RequestHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const stripeOldData = await StripeOldData.findAll({
    order: [['date', 'DESC']]
  });
  res.json({
    ok: true,
    stripe_old_data: stripeOldData,
  });
});