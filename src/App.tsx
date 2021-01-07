import axios from 'axios';
import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { geocode } from 'opencage-api-client';
import React, { useState, useEffect } from 'react';
import { LineChart } from 'react-native-chart-kit';
import {
    Image,
    Text,
    SafeAreaView,
    ScrollView,
    RefreshControl,
    StyleSheet,
    ActivityIndicator,
    View,
} from 'react-native';
import SwitchSelector from 'react-native-switch-selector';

import { Geocode } from './Geocode';
import { toCelsius, toFahrenheit } from './TemperatureUtil';
import { DailyEntity, Weather, Current, HourlyEntity, WeatherEntity } from './Weather';
import { Dimensions } from 'react-native';
import { LineChartData } from 'react-native-chart-kit/dist/line-chart/LineChart';
import { ChartConfig, Dataset } from 'react-native-chart-kit/dist/HelperTypes';
import { LinearGradient } from 'expo-linear-gradient';
import { DeviceType, getDeviceTypeAsync } from 'expo-device';

enum WeekDay {
    Sunday,
    Monday,
    Tuesday,
    Wednesday,
    Thursday,
    Friday,
    Saturday,
}

export default function App(): JSX.Element {
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [geoCodeResults, setGeocode] = useState<Geocode | null>(null);
    const [weatherResults, setWeather] = useState<Weather | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [refreshing, setRefreshing] = React.useState(false);
    const [deviceType, setDeviceType] = React.useState<DeviceType>(DeviceType.PHONE);

    const [isCelcius, setCelcius] = useState(false);
    const toggleSwitch = () => setCelcius((previousState) => !previousState);

    const OPEN_WEATHER_API_ENDPOINT: string = Constants.manifest.extra.open_weather_api_endpoint;
    const OPEN_WEATHER_ICON_ENDPOINT: string = Constants.manifest.extra.open_weather_icon_endpoint;

    const screenWidth = Dimensions.get('window').width;
    const currentUnit = isCelcius ? ' °C' : ' °F';

    const chartConfig: ChartConfig = {
        backgroundGradientFrom: '#0040fc',
        backgroundGradientFromOpacity: 1,
        backgroundGradientTo: '#41aeff',
        backgroundGradientToOpacity: 1,
        color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
        barPercentage: 0.5,
        decimalPlaces: 0,
    };

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        setLocation(null);
        setGeocode(null);
        setWeather(null);

        getCurrentLocation().then(() => setRefreshing(false));
    }, []);

    async function getCurrentLocation(): Promise<void> {
        setDeviceType(await getDeviceTypeAsync());
        const { status } = await Location.requestPermissionsAsync();
        if (status !== 'granted') {
            setErrorMsg('Permission to access location was denied');
            return;
        }

        const location = await Location.getCurrentPositionAsync({});
        setLocation(location);
        getCurrentCityStateCountryFromLocation(location);
        getCurrentWeatherFromCurrentLocation(location);
    }

    function getCurrentCityStateCountryFromLocation(location: Location.LocationObject): void {
        const latitude = location.coords.latitude;
        const longitude = location.coords.longitude;
        geocode({ q: `${latitude},${longitude}`, key: Constants.manifest.extra.open_cage_api_key })
            .then((data) => {
                setGeocode(data as Geocode);
            })
            .catch((error) => {
                setErrorMsg('Geocode Error: ' + error.message);
                setGeocode(null);
            });
    }

    async function getCurrentWeatherFromCurrentLocation(location: Location.LocationObject): Promise<void> {
        const openWeatherResults = await axios.post(
            OPEN_WEATHER_API_ENDPOINT.replace('{lat}', location.coords.latitude.toString()).replace(
                '{lon}',
                location.coords.longitude.toString()
            )
        );
        setWeather(openWeatherResults.data as Weather);
    }

    useEffect(() => {
        getCurrentLocation();
    }, []);

    function getWeatherInCorrectUnits(temp: number): number {
        return isCelcius ? toCelsius(temp) : toFahrenheit(temp);
    }

    function renderTemperatureSlider(): JSX.Element {
        return (
            <SwitchSelector
                style={styles.temperatureSlider}
                options={[
                    { label: '°F', value: 'f' },
                    { label: '°C', value: 'c' },
                ]}
                initial={0}
                onPress={toggleSwitch}
                hasPadding
            />
        );
    }

    function renderErrorMessage(): JSX.Element {
        if (errorMsg) {
            return <Text>{`Error: ${errorMsg} \nPlease reload to retry`}</Text>;
        }
        return <></>;
    }

    function renderLocationInformation(): JSX.Element {
        if (geoCodeResults && geoCodeResults.results) {
            const geoCodeComponents = geoCodeResults.results[0].components;
            return (
                <Text style={styles.locationText}>{`${geoCodeComponents.city}, ${
                    geoCodeComponents.state
                }, ${geoCodeComponents.country_code.toUpperCase()}`}</Text>
            );
        }
        return <></>;
    }

    function renderLocationDate(): JSX.Element {
        if (weatherResults) {
            const date: Date = new Date(weatherResults.current.dt * 1000);
            return (
                <Text style={styles.dateText}>{`${WeekDay[date.getDay()]} ${date.getDate()}, ${date.getHours()}:${
                    date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()
                } `}</Text>
            );
        }
        return <></>;
    }

    function attemptWeatherImageRender(
        weather?: Current | HourlyEntity | DailyEntity,
        width = 100,
        height = 100
    ): JSX.Element {
        if (weather && weather.weather) {
            return renderWeatherImage(weather.weather[0], width, height);
        }
        return <></>;
    }

    function renderWeatherImage(weatherEntity: WeatherEntity, width: number, height: number): JSX.Element {
        return (
            <View style={styles.weatherImage}>
                <Image
                    source={{
                        uri: OPEN_WEATHER_ICON_ENDPOINT.replace('{icon_id}', weatherEntity.icon),
                    }}
                    style={{ width: width, height: height }}
                />
                <Text>{weatherEntity.main}</Text>
            </View>
        );
    }

    function renderWeatherInformation(): JSX.Element {
        if (weatherResults) {
            return (
                <Text style={styles.temperature}>
                    {getWeatherInCorrectUnits(weatherResults.current.temp)}
                    <Text style={styles.temperatureSymbol}>{currentUnit}</Text>
                </Text>
            );
        }
        return <></>;
    }

    function renderWeatherGraph(): JSX.Element {
        if (weatherResults) {
            let dailyWeatherData: LineChartData = { labels: [], datasets: [] };
            let dailyWeatherDataset: Dataset = { data: [] };
            let height = deviceType === DeviceType.PHONE ? 300 : 500;

            weatherResults?.daily?.forEach((dailyEntity) => {
                const date: Date = new Date(dailyEntity.dt * 1000);
                if (deviceType !== DeviceType.PHONE) {
                    dailyWeatherData.labels.push(`${WeekDay[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`);
                } else {
                    dailyWeatherData.labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
                }
                dailyWeatherDataset.data.push(getWeatherInCorrectUnits(dailyEntity.temp.max));
            });
            dailyWeatherData.datasets.push(dailyWeatherDataset);
            dailyWeatherData.legend = [`1 Week Daily Max Temperature ${currentUnit}`];

            return (
                <LineChart
                    style={styles.dailyWeatherChart}
                    data={dailyWeatherData}
                    width={screenWidth}
                    height={height} // gah, this should really be a CSS defined prop.. Since it's not we will just pass in different values based on mobile or web.
                    chartConfig={chartConfig}
                />
            );
        }
        return <></>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <LinearGradient
                style={styles.container}
                colors={['rgba(0,64,252,1)', 'rgba(65,174,255,1)']}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollView}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                >
                    <ActivityIndicator
                        size="large"
                        animating={
                            location == null || geoCodeResults == null || weatherResults == null || errorMsg != null
                        }
                    />
                    <View style={styles.contentPadding}>
                        {renderTemperatureSlider()}
                        {renderErrorMessage()}
                        {renderLocationInformation()}
                        {renderLocationDate()}
                        <View style={styles.weatherEntity}>
                            {attemptWeatherImageRender(weatherResults?.current)}
                            {renderWeatherInformation()}
                        </View>
                    </View>
                    {renderWeatherGraph()}
                </ScrollView>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        height: '100%',
    },
    scrollView: {
        flex: 1,
        marginTop: 30,
    },
    contentPadding: {
        marginLeft: 10,
    },
    temperatureSlider: {
        minWidth: '10%',
        maxWidth: '50%',
    },
    temperature: {
        fontSize: 50,
        textAlignVertical: 'top',
        width: 500,
    },
    temperatureSymbol: {
        fontSize: 40,
        textAlignVertical: 'top',
    },
    dateText: {
        color: 'grey',
        fontSize: 30,
    },
    locationText: {
        color: 'black',
        fontSize: 40,
    },
    weatherEntity: {
        flexDirection: 'row',
        minWidth: '10%',
        maxWidth: '30%',
        alignItems: 'center',
    },
    weatherImage: {
        flexDirection: 'column',
        alignItems: 'center',
    },
    dailyWeatherChart: {
        alignSelf: 'flex-end',
        marginTop: 'auto',
    },
});

registerRootComponent(App);
