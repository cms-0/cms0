import { cms0 } from '@cms0/cms0'
import type { Image, LocalizedRichText, LocalizedString, Seo } from '@cms0/cms0/custom-types'

// Custom types for reusable structures
export type Feature = {
  title: {
    desktop: LocalizedRichText
    mobile: LocalizedRichText
  }
  description: {
    desktop: LocalizedRichText
    mobile: LocalizedRichText
  }
}

export type Testimonial = {
  quote: {
    desktop: LocalizedString
    mobile: LocalizedString
  }
  name: {
    desktop: LocalizedString
    mobile: LocalizedString
  }
  title: {
    desktop: LocalizedString
    mobile: LocalizedString
  }
  stats: {
    desktop: { value: LocalizedString; label: LocalizedString }[]
    mobile: { value: LocalizedString; label: LocalizedString }[]
  }
  avatar: Image
}

export type SecurityFeature = {
  title: LocalizedRichText
  description: LocalizedRichText
  icon: Image
}

export type FaqItem = {
  question: LocalizedRichText
  answer: LocalizedString
  defaultOpen: boolean
}

export type Plan = {
  title: LocalizedString
  description: {
    desktop: LocalizedString
    mobile: LocalizedString
  }
  isPopular: boolean
  isPopularText?: LocalizedString
  icon?: Image
  cta: Link
  price: {
    yearly: LocalizedString
    monthly: LocalizedString
  }
}

export type MarketplaceOptionTag = {
  name: LocalizedString
}

export type MarketplaceOption = {
  category: MarketplaceCategory
  title: LocalizedString
  description: LocalizedString
  tag?: MarketplaceOptionTag
  action?: Link
  icon: Image
}

export type MarketplaceCategory = {
  name: LocalizedString
  icon: Image
}

export type ProductOffering = {
  category: ProductOfferingCategory
  title: LocalizedRichText
  description: LocalizedRichText
  featuresTitle: LocalizedString
  features: LocalizedString[]
  cta: Link
  image: Image
}

export type ProductOfferingCategory = {
  name: LocalizedString
  icon: Image
}

export type Link = {
  label: LocalizedString
  href: string
  icon?: Image
}

export type FooterLinkGroup = {
  title: LocalizedString
  links: Link[]
}

export type PlanFeatureCategory = {
  name: LocalizedString
  icon: Image
}

export type PlanFeature = {
  name: LocalizedString
}

type RootSchema = {
  HomePage: {
    heroSection: {
      trustedByText: LocalizedRichText
      headline: LocalizedRichText
      subHeadline: LocalizedRichText
      primaryCtaText: {
        desktop: LocalizedString
        mobile: LocalizedString
      }
      secondaryCtaText: {
        desktop: LocalizedString
        mobile: LocalizedString
      }
      trustedByLabel: LocalizedString
    }
    featuresSection: {
      heading: LocalizedRichText
      subheading: LocalizedRichText
      features: Feature[]
      demoCta: LocalizedString
      demoCtaUrl: string
    }
    testimonialSection: {
      heading: LocalizedRichText
      testimonials: Testimonial[]
    }
    securitySection: {
      heading: LocalizedRichText
      ctaText: LocalizedString
      ctaTextUrl: string
      features: SecurityFeature[]
      featuresCtaText: LocalizedString
      featuresCtaUrl: string
    }
    faqSection: {
      heading: LocalizedRichText
      whatsappText: LocalizedRichText
      whatsappButtonText: LocalizedString
      whatsappUrl: string
      faqs: FaqItem[]
    }
    planSection: {
      title: LocalizedRichText
      mostPopularBadgeText: LocalizedString
      learnMoreText: LocalizedString
      learnMoreUrl: string
      plans: Plan[]
    }
    seo?: Seo
  }
  PricingPage: {
    pricingTableSection: {
      headline: LocalizedRichText
      monthlyText: LocalizedString
      yearlyText: LocalizedString
      yearlyDiscountText: LocalizedString
      featuresColumnTitle: LocalizedString
      plans: Plan[]
      featureCategories: PlanFeatureCategory[]
      featuresPlansPrices: {
        feature: PlanFeature
        featureCategory: PlanFeatureCategory
        plan: Plan
        featurePlanActive: boolean
        featurePlanText?: LocalizedString
      }[]
      featuresPlansPricesMobile: {
        plan: Plan
        features: LocalizedString[]
      }[]
    }
    productOfferingSection: {
      headline: {
        mobile: LocalizedRichText
        desktop: LocalizedRichText
      }
      productOfferingCategories: ProductOfferingCategory[]
      productOfferings: ProductOffering[]
    }
    featuresSection: {
      heading: LocalizedRichText
      features: Feature[]
      cta: Link
    }
    joinSection: {
      heading: LocalizedRichText
      primaryText: LocalizedString
      primaryTextUrl: string
      secondaryText: LocalizedString
      secondaryTextUrl: string
    }
    seo?: Seo
  }
  MarketplacePage: {
    heroSection: {
      headline: LocalizedRichText
      subheadline: LocalizedRichText
      ctaText: LocalizedString
      ctaTextUrl: string
    }
    categorySection: {
      headline: LocalizedString
      categories: MarketplaceCategory[]
      marketplaceOptions: MarketplaceOption[]
    }
    quoteSection: {
      title: LocalizedString
      name: LocalizedString
      quote: LocalizedString
      image: Image
      logo: Image
    }
    ctaSection: {
      heading: LocalizedRichText
      primaryText: LocalizedString
      primaryTextUrl: string
      secondaryText: LocalizedString
      secondaryTextUrl: string
    }
    planSection: {
      title: LocalizedRichText
      mostPopularBadgeText: LocalizedString
      learnMoreText: LocalizedString
      learnMoreUrl: string
      plans: Plan[]
    }
    seo?: Seo
  }
  LoginPage: {
    headline: LocalizedRichText
    emailPlaceholder: LocalizedString
    passwordPlaceholder: LocalizedString
    submitButton: LocalizedString
    signup: {
      text: LocalizedString
      linkText: LocalizedString
    }
    seo?: Seo
  }
  SignupPage: {
    headline: LocalizedRichText
    phonNumberPlaceholder: LocalizedString
    emailPlaceholder: LocalizedString
    passwordPlaceholder: LocalizedString
    submitButton: LocalizedString
    signin: {
      text: LocalizedString
      linkText: LocalizedString
    }
    seo?: Seo
  }
  ContactPage: {
    headline: LocalizedRichText
    subheadline: LocalizedRichText
    firstNamePlaceholder: LocalizedString
    lastNamePlaceholder: LocalizedString
    emailPlaceholder: LocalizedString
    phonePlaceholder: LocalizedString
    messagePlaceholder: LocalizedString
    submitButton: LocalizedString
    seo?: Seo
  }
  PrivacyPolicyPage: {
    title: LocalizedRichText
    content: LocalizedRichText
    seo?: Seo
  }
  TermsPage: {
    title: LocalizedRichText
    content: LocalizedRichText
    seo?: Seo
  }
  Footer: {
    newsletterText: LocalizedRichText
    newsletterEmailPlaceholder: LocalizedString
    newsletterButtonText: LocalizedString
    newsletterSuccessTitle: LocalizedString
    newsletterSuccessDescription: LocalizedString
    copyright: LocalizedString
    linkGroups: FooterLinkGroup[]
    socialLinks: Link[]
  }
  Header: {
    navLinks: Link[]
    loginText: LocalizedString
    signupText: LocalizedString
  }
}

export const data = cms0<RootSchema>({
  apiConfig: {
    baseUrl: import.meta.env.VITE_CMS0_API_BASEURL,
    key: import.meta.env.VITE_CMS0_API_KEY,
  },
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  includeId: true,
})

// export type HomePage = Awaited<ReturnType<typeof data.HomePage>>;
// export type PricingPage = Awaited<ReturnType<typeof data.PricingPage>>;
// export type MarketplacePage = Awaited<ReturnType<typeof data.MarketplacePage>>;
// export type SignupPage = Awaited<ReturnType<typeof data.SignupPage>>;
// export type LoginPage = Awaited<ReturnType<typeof data.LoginPage>>;
// export type Footer = Awaited<ReturnType<typeof data.Footer>>;
// export type HeaderData = Awaited<ReturnType<typeof data.Header>>;
